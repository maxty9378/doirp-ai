'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AudioStreamer } from './AudioStreamer';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/** Модель для Live API (голос): gemini-2.0-flash-exp не поддерживает bidiGenerateContent */
const LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

const PCM_IN_SAMPLE_RATE = 16_000;
const PCM_OUT_SAMPLE_RATE = 24_000;

const USER_VOLUME_SCALE = 500;
const AI_VOLUME_SCALE = 0.15;
const VOLUME_SMOOTH = 0.25;
const VOLUME_DECAY = 0.85;

export interface GeminiLiveConfig {
  apiKey: string;
  assistantLabel?: string;
  autoSuccessPrompt?: string | null;
  contextWindow?: number;
  enableCheckpoints?: boolean;
  enableScoring?: boolean;
  /** URL WebSocket-прокси (когда задан VOICE_CALL_WS_PROXY_URL), иначе клиент подключается к Google напрямую */
  geminiWsUrl?: string | null;
  /** Массив целей сценария из редактора (используем как чекпоинты в UI) */
  goals?: string[];
  introDialogButtonLabel?: string | null;
  introDialogDescription?: string | null;
  introDialogHint?: string | null;
  introDialogPlaceholder?: string | null;
  introDialogTitle?: string | null;
  openingInstruction?: string | null;
  quietSpeakerNudge?: string | null;
  roundEndingPrompt?: string | null;
  scoreDisplayLabel?: string | null;
  scoreLevelLabels?: ScoreLevelLabelsConfig | null;
  shortAnswerNudge?: string | null;
  showIntroDialog?: boolean | null;
  silenceHardHangupMs?: number;
  silenceNudgeAfterMs?: number;
  silenceNudgeCooldownMs?: number;
  silenceNudgePhrases?: string[];
  silenceNudgeTemplate?: string | null;
  systemInstruction: string;
  userLabel?: string;
  voiceName: string;
}

export interface ScoreLevelLabelsConfig {
  high?: string;
  low?: string;
  mid?: string;
}

export interface GeminiLiveUIConfig {
  assistantLabel: string;
  autoSuccessPrompt?: string | null;
  contextWindow: number;
  enableCheckpoints: boolean;
  enableScoring: boolean;
  /** Цели сценария, заданные в редакторе */
  goals: string[];
  introDialogButtonLabel?: string | null;
  introDialogDescription?: string | null;
  introDialogHint?: string | null;
  introDialogPlaceholder?: string | null;
  introDialogTitle?: string | null;
  openingInstruction?: string | null;
  quietSpeakerNudge?: string | null;
  roundEndingPrompt?: string | null;
  scoreDisplayLabel?: string | null;
  scoreLevelLabels?: ScoreLevelLabelsConfig | null;
  shortAnswerNudge?: string | null;
  showIntroDialog: boolean;
  silenceHardHangupMs: number;
  silenceNudgeAfterMs: number;
  silenceNudgeCooldownMs: number;
  silenceNudgePhrases: string[];
  silenceNudgeTemplate?: string | null;
  userLabel: string;
}

const PATIENCE_INITIAL = 100;
const MUMBLE_VOLUME_THRESHOLD = 5;
const MUMBLE_DURATION_MS = 10_000;
const MUMBLE_COOLDOWN_MS = 30_000;
const BARGE_IN_VOLUME_THRESHOLD = 6;
const BARGE_IN_COOLDOWN_MS = 150;
const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_SILENCE_NUDGE_AFTER_MS = 15_000;
const DEFAULT_SILENCE_NUDGE_COOLDOWN_MS = 15_000;
// По умолчанию раунд длится 5 минут
const DEFAULT_SILENCE_HARD_HANGUP_MS = 300_000;
const DEFAULT_SILENCE_NUDGE_PHRASES = ['Алло, вы меня вообще слушаете?'];
const DEFAULT_ROUND_ENDING_PROMPT =
  'Через 15 секунд наш эфир на конференции подходит к концу. Кратко подведи итог: убедил ли тебя собеседник или нет, и скажи: "зрители нашего стрима сами сделают выводы". После этого естественно завершай разговор как в реальном живом общении на мероприятии, без служебных фраз про окончание звонка.';
const DEFAULT_SILENCE_NUDGE_TEMPLATE = 'Собеседник молчит. Скажи коротко: "{{phrase}}".';
const DEFAULT_SHORT_ANSWER_NUDGE =
  'Отвечай короче: 1-2 предложения и по сути, затем жди ответ собеседника.';
const DEFAULT_QUIET_SPEAKER_NUDGE =
  'Собеседник говорит очень тихо и неуверенно. Сделай ему жесткое замечание.';
const DEFAULT_AUTO_SUCCESS_PROMPT =
  'Маркетолог блестяще справился с напором, сохранил лицо бренда и не оставил места для манипуляций. Признай поражение иронично, например: "Ладно, вы хорошо подготовились к эфиру... Но мы ещё проверим ваши слова. На этом всё, возвращаемся в студию!" и естественно заверши диалог в стиле прямого эфира.';
const MONOLOGUE_DURATION_MS = 15_000;
const MONOLOGUE_VOLUME_THRESHOLD = 10;
const AMBIENT_AUDIO_URL = '/audio/ambient-store.mp3?v=20260302';

/** Очищает служебные теги в тексте от модели */
function cleanAiText(text: string): string {
  let cleaned = text.replaceAll(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replaceAll(/\[CURRENT_SCORE:\s*[-+]\d+\]/gi, '');
  cleaned = cleaned.replaceAll(/\[CHECKPOINT:\s*[A-Z]+\]/gi, '');
  cleaned = cleaned.replaceAll(/\s+/g, ' ');
  return cleaned.trim();
}

export interface TranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export type HangUpReason = 'abuse' | 'silence' | 'ai' | 'success' | null;

export interface VoiceCallCheckpoint {
  done: boolean;
  id: 'empathy' | 'value' | 'nextStep';
  label: string;
}

const CHECKPOINTS_TEMPLATE: VoiceCallCheckpoint[] = [
  { done: false, id: 'empathy', label: 'Снять напряжение: признать эмоции клиента' },
  { done: false, id: 'value', label: 'Дать аргумент выгоды без прямой скидки' },
  { done: false, id: 'nextStep', label: 'Зафиксировать следующий шаг (встреча/пробная поставка)' },
];

const HANGUP_PHRASE_RE = /кладу\s+трубку/i;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export interface UseGeminiLiveOptions {
  agentId?: string;
  onCallEnd?: (transcript: TranscriptEntry[]) => void;
  onError?: (message: string) => void;
  speakerName?: string;
  systemInstruction: string;
  voiceName?: string;
}

export function useGeminiLive({
  agentId = 'voice-simulator-lpr',
  onCallEnd,
  onError,
  systemInstruction,
  voiceName = 'Kore',
  speakerName,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [score, setScore] = useState(0);
  const [patience, setPatience] = useState(PATIENCE_INITIAL);
  const [hangUpByLpr, setHangUpByLpr] = useState(false);
  const [hangUpReason, setHangUpReason] = useState<HangUpReason>(null);
  const [subtitle, setSubtitle] = useState('');
  const [checkpoints, setCheckpoints] = useState<VoiceCallCheckpoint[]>(CHECKPOINTS_TEMPLATE);
  const [uiConfig, setUiConfig] = useState<GeminiLiveUIConfig>({
    assistantLabel: 'ИИ-агент',
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    enableCheckpoints: true,
    enableScoring: true,
    goals: [],
    showIntroDialog: true,
    silenceHardHangupMs: DEFAULT_SILENCE_HARD_HANGUP_MS,
    silenceNudgeAfterMs: DEFAULT_SILENCE_NUDGE_AFTER_MS,
    silenceNudgeCooldownMs: DEFAULT_SILENCE_NUDGE_COOLDOWN_MS,
    silenceNudgePhrases: DEFAULT_SILENCE_NUDGE_PHRASES,
    userLabel: 'Вы',
  });
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playContextRef = useRef<AudioContext | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isPlayingRef = useRef(false);
  const configFetchedRef = useRef(false);
  const configRef = useRef<GeminiLiveConfig | null>(null);
  const uiConfigRef = useRef<GeminiLiveUIConfig>(uiConfig);
  const lastAgentIdRef = useRef<string>(agentId);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const userVolumeTargetRef = useRef(0);
  const userVolumeCurrentRef = useRef(0);
  const aiVolumeCurrentRef = useRef(0);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const lastBargeInAtRef = useRef(0);

  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const currentAiTurnTextRef = useRef('');
  const lastUserSpeechRef = useRef<number>(0);

  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(null);
  const recognitionActiveRef = useRef(false);
  const ambientRef = useRef<HTMLAudioElement | null>(null);

  const connectionLockRef = useRef(false);
  const isCallActive = status === 'connecting' || status === 'ready';

  const lowVolumeSinceRef = useRef<number>(0);
  const mumbleCooldownRef = useRef<number>(0);
  const lastBotEndRef = useRef<number>(0);
  const monologueTriggeredRef = useRef(false);
  const silenceSinceRef = useRef<number>(0);
  const silenceCooldownRef = useRef<number>(0);
  const silenceNudgeCountRef = useRef(0);
  const disconnectRef = useRef<() => void>(() => {});
  const hangUpToneRef = useRef<() => void>(() => {});
  const hangupScheduledRef = useRef(false);
  const isSetupCompleteRef = useRef(false);
  const autoFinishTriggeredRef = useRef(false);
  const aiSpeakingSinceRef = useRef<number>(0);
  const roundStartRef = useRef<number | null>(null);
  const roundVerdictTriggeredRef = useRef(false);
  const firstAiTurnCompleteRef = useRef(false);
  const speakerNameRef = useRef(speakerName?.trim() || '');

  useEffect(() => {
    speakerNameRef.current = speakerName?.trim() || '';
  }, [speakerName]);

  const cleanupMedia = () => {
    try {
      const ambient = ambientRef.current;
      if (ambient) {
        try {
          ambient.pause();
        } catch {}
        try {
          ambient.currentTime = 0;
        } catch {}
      }
    } catch {}
    ambientRef.current = null;

    try {
      streamerRef.current?.stop();
    } catch {}
    streamerRef.current = null;

    if (workletNodeRef.current && sourceRef.current) {
      try {
        sourceRef.current.disconnect();
        workletNodeRef.current.disconnect();
      } catch {}
    }
    workletNodeRef.current = null;

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      } catch {}
      streamRef.current = null;
    }

    try {
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
    } catch {}
    wsRef.current = null;

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {}
      audioContextRef.current = null;
    }
    if (playContextRef.current) {
      try {
        if (playContextRef.current.state !== 'closed') {
          playContextRef.current.close().catch(() => {});
        }
      } catch {}
      playContextRef.current = null;
    }

    sourceRef.current = null;
    isPlayingRef.current = false;
    isSetupCompleteRef.current = false;
    userVolumeTargetRef.current = 0;
    userVolumeCurrentRef.current = 0;
    aiVolumeCurrentRef.current = 0;
    connectionLockRef.current = false;
    hangupScheduledRef.current = false;
    autoFinishTriggeredRef.current = false;
    aiSpeakingSinceRef.current = 0;
  };

  const playTone = useCallback((freq: number, duration: number, startTime: number) => {
    const ctx = playContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }, []);

  const playConnectionTone = useCallback(() => {
    const ctx = playContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    const t = ctx.currentTime;
    playTone(880, 0.12, t);
    playTone(1100, 0.12, t + 0.18);
  }, [playTone]);

  const playDisconnectTone = useCallback(() => {
    const ctx = playContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    playTone(440, 0.2, ctx.currentTime);
  }, [playTone]);

  const playHangUpTone = useCallback(() => {
    const ctx = playContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 180;
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.08);
  }, []);

  const reportError = useCallback(
    (msg: string) => {
      setStatus('error');
      setErrorMessage(msg);
      onError?.(msg);
    },
    [onError],
  );

  const sendClientText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true },
      }),
    );
  }, []);

  const finalizeByLpr = useCallback(
    (reason: Exclude<HangUpReason, null>, message: string, delayMs = 1200, markAsError = true) => {
      if (hangupScheduledRef.current) return;
      hangupScheduledRef.current = true;
      setHangUpReason(reason);
      setHangUpByLpr(true);
      if (markAsError) {
        reportError(message);
      } else {
        setErrorMessage(message);
        setSubtitle(message);
      }
      setTimeout(() => {
        hangUpToneRef.current();
        disconnectRef.current();
      }, delayMs);
    },
    [reportError],
  );

  const maybeAutoFinish = useCallback(
    (latestScore: number) => {
      if (status !== 'ready' || autoFinishTriggeredRef.current || hangupScheduledRef.current) return;
      if (!uiConfigRef.current.enableCheckpoints || !uiConfigRef.current.enableScoring) return;

      const allDone = checkpoints.every((item) => item.done);
      const enoughDialogue = transcriptRef.current.length >= 6;
      if (!allDone || !enoughDialogue || latestScore < 12) return;

      autoFinishTriggeredRef.current = true;
      sendClientText(uiConfigRef.current.autoSuccessPrompt ?? DEFAULT_AUTO_SUCCESS_PROMPT);

      setTimeout(() => {
        if (hangupScheduledRef.current || status !== 'ready') return;
        finalizeByLpr('success', 'Звонок завершен: клиент согласился на следующий шаг.', 1200, false);
      }, 9000);
    },
    [finalizeByLpr, sendClientText, status, checkpoints],
  );

  const connect = useCallback(async () => {
    if (connectionLockRef.current) return;
    connectionLockRef.current = true;
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Starting connect...');

    try {
      // Сначала загружаем конфиг (цели, подписи и т.д.), чтобы панель «Цели разговора» отображалась сразу при появлении статуса connecting
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Fetching config...');
      if (!configFetchedRef.current || !configRef.current || lastAgentIdRef.current !== agentId) {
        const speaker = speakerName?.trim();
        const query = new URLSearchParams({ agentId });
        if (speaker) query.set('speakerName', speaker);
        const res = await fetch(`/api/voice-call/config?${query.toString()}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Ошибка загрузки конфига: ${res.status}`);
        lastAgentIdRef.current = agentId;
        configRef.current = await res.json();
        configFetchedRef.current = true;
      }
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Config fetched successfully');

      const config = configRef.current as typeof configRef.current & { systemInstruction?: string };
      if (!config?.apiKey) throw new Error('Нет API-ключа Google.');

      const nextUiConfig: GeminiLiveUIConfig = {
        assistantLabel: config.assistantLabel || 'ИИ-агент',
        contextWindow: config.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
        enableCheckpoints: config.enableCheckpoints ?? true,
        enableScoring: config.enableScoring ?? true,
        goals: Array.isArray(config.goals) ? config.goals : [],
        introDialogButtonLabel: config.introDialogButtonLabel ?? undefined,
        introDialogDescription: config.introDialogDescription ?? undefined,
        introDialogHint: config.introDialogHint ?? undefined,
        introDialogPlaceholder: config.introDialogPlaceholder ?? undefined,
        introDialogTitle: config.introDialogTitle ?? undefined,
        showIntroDialog: config.showIntroDialog ?? true,
        openingInstruction: config.openingInstruction ?? undefined,
        roundEndingPrompt: config.roundEndingPrompt ?? undefined,
        silenceNudgeTemplate: config.silenceNudgeTemplate ?? undefined,
        shortAnswerNudge: config.shortAnswerNudge ?? undefined,
        quietSpeakerNudge: config.quietSpeakerNudge ?? undefined,
        autoSuccessPrompt: config.autoSuccessPrompt ?? undefined,
        scoreDisplayLabel: config.scoreDisplayLabel ?? undefined,
        scoreLevelLabels: config.scoreLevelLabels ?? undefined,
        silenceHardHangupMs: config.silenceHardHangupMs ?? DEFAULT_SILENCE_HARD_HANGUP_MS,
        silenceNudgeAfterMs: config.silenceNudgeAfterMs ?? DEFAULT_SILENCE_NUDGE_AFTER_MS,
        silenceNudgeCooldownMs: config.silenceNudgeCooldownMs ?? DEFAULT_SILENCE_NUDGE_COOLDOWN_MS,
        silenceNudgePhrases:
          config.silenceNudgePhrases?.length ? config.silenceNudgePhrases : DEFAULT_SILENCE_NUDGE_PHRASES,
        userLabel: config.userLabel || 'Вы',
      };
      uiConfigRef.current = nextUiConfig;
      setUiConfig(nextUiConfig);

      setStatus('connecting');
      setErrorMessage(null);
      isSetupCompleteRef.current = false;
      setScore(0);
      setPatience(PATIENCE_INITIAL);
      setHangUpByLpr(false);
      setHangUpReason(null);
      setSubtitle('');
      const initialCheckpoints = nextUiConfig.enableCheckpoints
        ? (nextUiConfig.goals?.length ? nextUiConfig.goals : []).map((label, index) => ({
            id: CHECKPOINTS_TEMPLATE[index]?.id ?? `goal-${index}`,
            label: label ?? CHECKPOINTS_TEMPLATE[index]?.label ?? '',
            done: false,
          }))
        : [];
      setCheckpoints(initialCheckpoints);

      transcriptRef.current = [];
      setLiveTranscript([]);

      currentAiTurnTextRef.current = '';
      hangupScheduledRef.current = false;
      autoFinishTriggeredRef.current = false;
      aiSpeakingSinceRef.current = 0;
      silenceNudgeCountRef.current = 0;
      lastUserSpeechRef.current = 0;
      firstAiTurnCompleteRef.current = false;

      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Microphone acquired');

      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!playContextRef.current || playContextRef.current.state === 'closed') {
        playContextRef.current = new Ctx({ sampleRate: PCM_OUT_SAMPLE_RATE });
      }
      const playContext = playContextRef.current;
      if (!streamerRef.current) {
        const streamer = new AudioStreamer(playContext);
        streamer.onPlayStateChange = (playing) => {
          isPlayingRef.current = playing;
        };
        streamerRef.current = streamer;
        analyserRef.current = streamer.analyser;
        freqDataRef.current = new Uint8Array(streamer.analyser.frequencyBinCount);
      }
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new Ctx({ sampleRate: PCM_IN_SAMPLE_RATE });
      }

      // eslint-disable-next-line no-console
      console.log('[GeminiLive] AudioContexts created/resumed');
      if (playContextRef.current.state === 'suspended') await playContextRef.current.resume();
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

      try {
        if (!ambientRef.current) {
          const ambient = new Audio(AMBIENT_AUDIO_URL);
          ambient.loop = true;
          ambient.volume = 0.15;
          ambient.preload = 'auto';
          ambientRef.current = ambient;
          ambient.play().catch(() => {
            const retry = () => {
              ambient.play().catch(() => {});
            };
            window.addEventListener('pointerdown', retry, { once: true });
          });
        } else {
          ambientRef.current.play().catch(() => {});
        }
      } catch {}

      const baseUrl = config.geminiWsUrl || GEMINI_LIVE_WS;
      const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(config.apiKey)}`;
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Creating WebSocket...', url.slice(0, 100) + '...');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      const sendStartTrigger = () => {
        const assistantLabel = uiConfigRef.current.assistantLabel || 'собеседника';
        const trimmedName = speakerNameRef.current;
        const nameLine = trimmedName
          ? `Собеседника зовут ${trimmedName}. Обязательно обратись к нему по имени в первой реплике.`
          : 'Обратись к собеседнику вежливо на «вы» в первой реплике.';

        const customOpening = config.openingInstruction?.trim();
        const defaultOpeningText = `Начинай интервью. Представься коротко как ${assistantLabel} и произнеси первую реплику в прямой речи. ${nameLine} Сразу задай первый уточняющий вопрос в формате живого эфира для зрителей.`;
        const startText = customOpening
          ? customOpening
              .replaceAll('{{assistantLabel}}', assistantLabel)
              .replaceAll('{{nameLine}}', nameLine)
              .replaceAll('{{speakerInstruction}}', nameLine)
          : defaultOpeningText;

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // eslint-disable-next-line no-console
          console.log('[GeminiLive] Sending start trigger...');
          wsRef.current.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: startText }],
                  },
                ],
                turnComplete: true,
              },
            }),
          );
        }
      };

      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.log('[GeminiLive] WebSocket OPENED! Sending setupMsg...');
        const extraSpeakerLine =
          speakerName && speakerName.trim()
            ? `\n- На вопросы сейчас отвечает сотрудник: ${speakerName.trim()}. Обращайся к нему по имени.`
            : '';
        const sysInst =
          (config.systemInstruction || systemInstruction || '') +
          (extraSpeakerLine ? `\n\n${extraSpeakerLine}` : '');
        const setupMsg: Record<string, unknown> = {
          setup: {
            model: LIVE_MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName || voiceName } },
              },
            },
          },
        };
        if (sysInst) (setupMsg.setup as Record<string, unknown>).systemInstruction = { parts: [{ text: sysInst }] };
        ws.send(JSON.stringify(setupMsg));
      };

      ws.onmessage = async (event: MessageEvent) => {
        try {
          const raw =
            typeof event.data === 'string'
              ? event.data
              : await (event.data instanceof Blob
                  ? event.data.text()
                  : new TextDecoder().decode(event.data as ArrayBuffer));
          const data = JSON.parse(raw);

          if (data.error?.message) {
            console.error('[GeminiLive] Error from server:', data.error.message);
            reportError(data.error.message);
            return;
          }

          if (data.setupComplete) {
          // eslint-disable-next-line no-console
          console.log('[GeminiLive] Received setupComplete! Connection is ready.');
          isSetupCompleteRef.current = true;
          setStatus('ready');
          playConnectionTone();
          roundStartRef.current = Date.now();
          roundVerdictTriggeredRef.current = false;
          sendStartTrigger();
            return;
          }

          const serverContent = data.serverContent;
          if (!serverContent) return;

          if (serverContent.interrupted) {
            // Barge-in: stop any buffered AI audio immediately
            streamerRef.current?.stop();
            const interruptedText = currentAiTurnTextRef.current.trim();
            if (interruptedText) {
              setLiveTranscript((prev) => [...prev, { role: 'ai', text: interruptedText }]);
              transcriptRef.current.push({ role: 'ai', text: interruptedText });
            }
            currentAiTurnTextRef.current = '';
            return;
          }

          const parts = serverContent.modelTurn?.parts ?? serverContent.parts;
          if (parts?.length) {
            for (const part of parts) {
              const audioB64 = part.inlineData?.data ?? part.audio?.data;
              if (audioB64) streamerRef.current?.addPCM16(audioB64);

              if (part.text) {
                const textChunk = part.text;
                if (HANGUP_PHRASE_RE.test(textChunk) && !hangupScheduledRef.current) {
                  finalizeByLpr('ai', 'ЛПР завершил звонок.', 3500, true);
                }
              }
            }
          }

          const rawTranscriptionText = serverContent.outputTranscription?.text ?? '';
          const transcriptionText = rawTranscriptionText;
          if (transcriptionText) {
            currentAiTurnTextRef.current += transcriptionText + ' ';
            setSubtitle(cleanAiText(transcriptionText));
            if (HANGUP_PHRASE_RE.test(transcriptionText) && !hangupScheduledRef.current) {
              finalizeByLpr('ai', 'ЛПР завершил звонок.', 1500, true);
            }
            
            // Парсинг тегов скоринга от LLM на лету
            if (uiConfigRef.current.enableScoring) {
              const scoreMatches = [...transcriptionText.matchAll(/\[CURRENT_SCORE:\s*([-+]\d+)\]/gi)];
              if (scoreMatches.length > 0) {
                let totalDelta = 0;
                scoreMatches.forEach(match => {
                   totalDelta += parseInt(match[1], 10) || 0;
                });
                
                if (totalDelta !== 0) {
                  setScore((prev) => {
                    const nextScore = clamp(prev + totalDelta, -50, 50);
                    maybeAutoFinish(nextScore);
                    return nextScore;
                  });
                }
              }
            }
          }

          if (serverContent.turnComplete) {
            let turnText = currentAiTurnTextRef.current.trim();
            
            // Парсинг тегов чекпоинтов от LLM
            const checkpointMatches = [...turnText.matchAll(/\[CHECKPOINT:\s*([A-Z]+)\]/gi)];
            if (checkpointMatches.length > 0) {
              setCheckpoints(prev => {
                const next = [...prev];
                checkpointMatches.forEach(match => {
                  const id = match[1].toLowerCase();
                  const index = next.findIndex(cp => cp.id.toLowerCase() === id);
                  if (index !== -1) {
                    next[index] = { ...next[index], done: true };
                  }
                });
                return next;
              });
            }

            turnText = cleanAiText(turnText);

            if (turnText) {
              setLiveTranscript((prev) => [...prev, { role: 'ai', text: turnText }]);
              transcriptRef.current.push({ role: 'ai', text: turnText });
            }
            currentAiTurnTextRef.current = '';
            if (!firstAiTurnCompleteRef.current) {
              firstAiTurnCompleteRef.current = true;
            }
            lastBotEndRef.current = Date.now();
          }
        } catch (e) {
          console.warn('Ошибка парсинга:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('[GeminiLive] WebSocket error:', e);
        reportError('Ошибка WebSocket. Проверьте интернет.');
      };
      ws.onclose = (event) => {
        console.warn(`[GeminiLive] WebSocket closed with code: ${event.code}, reason: ${event.reason}`);
        wsRef.current = null;
        if (!isSetupCompleteRef.current) {
          connectionLockRef.current = false;
          const reasonStr = String(event.reason || '');
          const reasonLower = reasonStr.toLowerCase();
          const isLocationBlock =
            event.code === 1007 &&
            /location|not supported|region|country|geo/i.test(reasonLower);
          const isProdHost =
            typeof window !== 'undefined' &&
            !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
          if (isLocationBlock && isProdHost) {
            reportError(
              'Google Live API недоступен из браузера в этом регионе (прямое подключение). На продакшене задайте в Vercel переменную VOICE_CALL_WS_PROXY_URL=wss://ваш-хост-прокси/ и запустите scripts/voice-call-ws-proxy.mts на отдельном сервере (VPS, Railway, Fly.io) с HTTPS_PROXY до Google. Логи Vercel не показывают WebSocket браузера — соединение идёт с устройства пользователя.',
            );
          } else {
            reportError(
              `Live-соединение закрыто до старта (code: ${event.code}${reasonStr ? `: ${reasonStr}` : ''}). Проверьте VPN/прокси или настройку VOICE_CALL_WS_PROXY_URL на продакшене.`,
            );
          }
          return;
        }
        setStatus('idle');
      };

      const audioContext = audioContextRef.current!;
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Adding audio worklet module...');
      await audioContext.audioWorklet.addModule('/worklets/audio-processor.js');
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Audio worklet module added.');
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; volume: number }>) => {
        const { buffer, volume } = event.data;
        userVolumeTargetRef.current = Math.min(100, volume * USER_VOLUME_SCALE);
        if (isPlayingRef.current && userVolumeTargetRef.current >= BARGE_IN_VOLUME_THRESHOLD) {
          const now = Date.now();
          if (now - lastBargeInAtRef.current > BARGE_IN_COOLDOWN_MS) {
            lastBargeInAtRef.current = now;
            streamerRef.current?.stop();
          }
        }
        const wsState = wsRef.current;
        if (!wsState || wsState.readyState !== WebSocket.OPEN || !isSetupCompleteRef.current) return;
        // Пока ИИ не закончил первую реплику, не отправляем аудио с микрофона,
        // чтобы избежать реакции на фон/шум в начале разговора.
        if (!firstAiTurnCompleteRef.current) return;
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        wsState.send(
          JSON.stringify({
            realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: btoa(binary) }] },
          }),
        );
      };

      const source = audioContext.createMediaStreamSource(streamRef.current!);
      sourceRef.current = source;
      source.connect(workletNode);
    } catch (err) {
      connectionLockRef.current = false;
      reportError(err instanceof Error ? err.message : 'Не удалось подключиться');
    }
  }, [
    agentId,
    systemInstruction,
    voiceName,
    reportError,
    playConnectionTone,
    finalizeByLpr,
    maybeAutoFinish,
  ]);

  const disconnect = useCallback(() => {
    const transcript = [...transcriptRef.current];
    const recentTranscript = uiConfigRef.current.contextWindow
      ? transcript.slice(-uiConfigRef.current.contextWindow)
      : transcript;
    if (recentTranscript.length > 0 && onCallEnd) onCallEnd(recentTranscript);

    transcriptRef.current = [];
    setLiveTranscript([]);
    recognitionActiveRef.current = false;

    try {
      recognitionRef.current?.stop();
    } catch (_) {}
    recognitionRef.current = null;

    try {
      const ambient = ambientRef.current;
      if (ambient) {
        ambient.pause();
        try {
          ambient.currentTime = 0;
        } catch {}
      }
    } catch {}

    playDisconnectTone();

    cleanupMedia();

    setStatus('idle');
    setErrorMessage(null);
    setUserVolume(0);
    setAiVolume(0);
    setScore(0);
    setPatience(PATIENCE_INITIAL);
    const resetCheckpoints = CHECKPOINTS_TEMPLATE.map((cp, index) => ({
      ...cp,
      label: uiConfigRef.current.goals?.[index] ?? cp.label,
      done: false,
    }));
    setCheckpoints(uiConfigRef.current.enableCheckpoints ? resetCheckpoints : []);
    setHangUpReason(null);
  }, [playDisconnectTone, onCallEnd]);

  const clearError = useCallback(() => {
    connectionLockRef.current = false;
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);
  useEffect(() => {
    hangUpToneRef.current = playHangUpTone;
  }, [playHangUpTone]);
  useEffect(() => {
    if (status === 'connecting' || status === 'ready') return;
    const ambient = ambientRef.current;
    if (!ambient) return;
    try {
      ambient.pause();
      ambient.currentTime = 0;
    } catch {}
  }, [status]);

  useEffect(
    () => () => {
      cleanupMedia();
    },
    [],
  );

  useEffect(() => {
    if (status !== 'ready') return;

    const id = setInterval(() => {
      const vol = userVolumeCurrentRef.current;
      const now = Date.now();
      const silenceAfterMs = uiConfigRef.current.silenceNudgeAfterMs;
      const silenceCooldownMs = uiConfigRef.current.silenceNudgeCooldownMs;
      const silenceHardHangupMs = uiConfigRef.current.silenceHardHangupMs;
      const silencePhrases = uiConfigRef.current.silenceNudgePhrases;

      // Логика раунда по времени: за 15 секунд до конца просим ИИ подвести итоги,
      // по истечении времени — завершаем звонок.
      if (silenceHardHangupMs && roundStartRef.current) {
        const elapsed = now - roundStartRef.current;
        const remaining = silenceHardHangupMs - elapsed;

        if (!roundVerdictTriggeredRef.current && remaining <= 15_000 && remaining > 0) {
          roundVerdictTriggeredRef.current = true;
          sendClientText(uiConfigRef.current.roundEndingPrompt ?? DEFAULT_ROUND_ENDING_PROMPT);
        }

        if (remaining <= 0 && !hangupScheduledRef.current) {
          finalizeByLpr(
            'success',
            'Время раунда истекло. Звонок завершён автоматически.',
            1200,
            false,
          );
          return;
        }
      }

      if (isPlayingRef.current) {
        if (aiVolumeCurrentRef.current >= MONOLOGUE_VOLUME_THRESHOLD) {
          if (aiSpeakingSinceRef.current === 0) aiSpeakingSinceRef.current = now;

          const monologueDuration = now - aiSpeakingSinceRef.current;
          if (monologueDuration >= MONOLOGUE_DURATION_MS && !monologueTriggeredRef.current) {
            monologueTriggeredRef.current = true;
            streamerRef.current?.stop();
            sendClientText(uiConfigRef.current.shortAnswerNudge ?? DEFAULT_SHORT_ANSWER_NUDGE);
          }
        }

        lowVolumeSinceRef.current = 0;
        silenceSinceRef.current = 0;
        silenceNudgeCountRef.current = 0;
        return;
      }

      if (aiSpeakingSinceRef.current > 0) {
        aiSpeakingSinceRef.current = 0;
        lastBotEndRef.current = now;
        monologueTriggeredRef.current = false;
      }

      if (vol < 3) {
        lowVolumeSinceRef.current = 0;
        if (silenceSinceRef.current === 0) {
          silenceSinceRef.current = now;
        }

        const lastBotEnd = lastBotEndRef.current;
        const userSpokeAfterBot = lastUserSpeechRef.current > lastBotEnd;
        const roundStart = roundStartRef.current;

        // Подсказка при паузе после того, как бот уже говорил: «собеседник молчит, скажи …»
        if (
          lastBotEnd > 0 &&
          !userSpokeAfterBot &&
          now - lastBotEnd >= silenceAfterMs &&
          now >= silenceCooldownRef.current
        ) {
          const phrase =
            silencePhrases[Math.floor(Math.random() * silencePhrases.length)] ||
            DEFAULT_SILENCE_NUDGE_PHRASES[0];
          const template = uiConfigRef.current.silenceNudgeTemplate ?? DEFAULT_SILENCE_NUDGE_TEMPLATE;
          sendClientText(template.replaceAll('{{phrase}}', phrase));
          silenceCooldownRef.current = now + silenceCooldownMs;
          silenceNudgeCountRef.current += 1;
        } else if (
          // Начальная тишина: ИИ ещё не сказал первую реплику — через N секунд отправить подсказку, чтобы он заговорил.
          !firstAiTurnCompleteRef.current &&
          roundStart != null &&
          now - roundStart >= silenceAfterMs &&
          now >= silenceCooldownRef.current
        ) {
          const phrase =
            silencePhrases[Math.floor(Math.random() * silencePhrases.length)] ||
            DEFAULT_SILENCE_NUDGE_PHRASES[0];
          const template = uiConfigRef.current.silenceNudgeTemplate ?? DEFAULT_SILENCE_NUDGE_TEMPLATE;
          sendClientText(template.replaceAll('{{phrase}}', phrase));
          silenceCooldownRef.current = now + silenceCooldownMs;
          silenceNudgeCountRef.current += 1;
        }
      } else if (vol >= 3 && vol < MUMBLE_VOLUME_THRESHOLD) {
        silenceSinceRef.current = 0;
        lastUserSpeechRef.current = now;
        lastBotEndRef.current = 0;
        if (lowVolumeSinceRef.current === 0) {
          lowVolumeSinceRef.current = now;
        } else if (
          now - lowVolumeSinceRef.current >= MUMBLE_DURATION_MS &&
          now >= mumbleCooldownRef.current
        ) {
          sendClientText(uiConfigRef.current.quietSpeakerNudge ?? DEFAULT_QUIET_SPEAKER_NUDGE);
          mumbleCooldownRef.current = now + MUMBLE_COOLDOWN_MS;
          lowVolumeSinceRef.current = 0;
        }
      } else {
        lowVolumeSinceRef.current = 0;
        silenceSinceRef.current = 0;
        lastUserSpeechRef.current = now;
        lastBotEndRef.current = 0;
      }
    }, 1000);

    return () => clearInterval(id);
  }, [status, sendClientText, finalizeByLpr]);

  useEffect(() => {
    if (status !== 'connecting' && status !== 'ready') return;
    let rafId = 0;
    const tick = () => {
      const userTarget = userVolumeTargetRef.current;
      const userCur = userVolumeCurrentRef.current;
      userVolumeCurrentRef.current = userCur + (userTarget - userCur) * VOLUME_SMOOTH;
      setUserVolume(Math.round(userVolumeCurrentRef.current));

      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;
      if (analyser && freqData) {
        if (isPlayingRef.current) {
          analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) sum += freqData[i];
          const aiTarget = Math.min(100, (sum / freqData.length) * AI_VOLUME_SCALE);
          const aiCur = aiVolumeCurrentRef.current;
          aiVolumeCurrentRef.current = aiCur + (aiTarget - aiCur) * VOLUME_SMOOTH;
          setAiVolume(Math.round(aiVolumeCurrentRef.current));
        } else {
          aiVolumeCurrentRef.current *= VOLUME_DECAY;
          setAiVolume(Math.round(aiVolumeCurrentRef.current));
        }
      }

      if (ambientRef.current) {
        const targetAmbient = isPlayingRef.current ? 0.05 : 0.15;
        ambientRef.current.volume += (targetAmbient - ambientRef.current.volume) * 0.05;
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [status]);

  useEffect(() => {
    if (status !== 'ready') return;
    const win = typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }) : null;
    const SR = win?.SpeechRecognition ?? win?.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new (SR as any)();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'ru-RU';

    recognition.onresult = (e: unknown) => {
      const ev = e as { results?: Array<{ isFinal?: boolean; 0?: { transcript?: string } }>; resultIndex?: number } | undefined;
      const idx = ev?.resultIndex ?? 0;
      const result = ev?.results?.[idx];
      if (!result?.isFinal) return;
      const text = result[0]?.transcript?.trim();
      const isAiSpeakingNow = isPlayingRef.current;
      const userVolumeNow = userVolumeTargetRef.current;

      // Guard against echo: ignore recognition while AI speaks unless user is actually interrupting.
      if (isAiSpeakingNow && userVolumeNow < BARGE_IN_VOLUME_THRESHOLD) return;

      const lastEntry = transcriptRef.current.at(-1);
      if (text && text.length > 2 && lastEntry?.text !== text) {
        const newEntry: TranscriptEntry = { role: 'user', text };
        setLiveTranscript((prev) => [...prev, newEntry]);
        transcriptRef.current.push(newEntry);
        lastUserSpeechRef.current = Date.now();
        lastBotEndRef.current = 0;
      }
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (recognitionActiveRef.current && recognitionRef.current) {
        setTimeout(() => {
          try {
            if (recognitionActiveRef.current) recognition.start();
          } catch (_) {}
        }, 50);
      }
    };

    recognitionActiveRef.current = true;
    recognition.start();
    recognitionRef.current = recognition;

    return () => {
      recognitionActiveRef.current = false;
      try {
        recognition.stop();
      } catch (_) {}
      recognitionRef.current = null;
    };
  }, [status]);

  const getTranscript = useCallback((limit?: number) => {
    const items = [...transcriptRef.current];
    if (limit && items.length > limit) return items.slice(-limit);
    return items;
  }, []);

  return {
    clearError,
    connect,
    disconnect,
    errorMessage,
    hangUpByLpr,
    hangUpReason,
    status,
    isCallActive,
    userVolume,
    aiVolume,
    score,
    subtitle,
    patience,
    checkpoints,
    getTranscript,
    liveTranscript,
    analyserRef,
    uiConfig,
  };
}
