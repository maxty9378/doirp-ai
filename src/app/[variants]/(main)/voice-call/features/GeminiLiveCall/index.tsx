'use client';

import { Avatar, Button, Icon, Modal, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Mic, PhoneOff } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CheckpointsDisplay } from '@/components/CheckpointsDisplay';
import { EqualizerBars } from '@/components/EqualizerBars';
import { LiveChat } from '@/components/LiveChat';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { RoundTimer } from '@/components/RoundTimer';
import { ScoreDisplayBroadcast } from '@/components/ScoreDisplayBroadcast';
import { VOICE_AGENT_TITLES } from '@/config/voiceAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useGeminiLive, type TranscriptEntry } from './useGeminiLive';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const styles = createStaticStyles(({ css }) => ({
  root: css`
    height: 100%; width: 100%; display: flex; flex-direction: column; background: var(--colorBgLayout); padding: 16px; padding-bottom: 72px;
    position: relative; overflow: hidden;
    transition: box-shadow 0.5s ease;
    @media (min-width: 640px) { padding-bottom: 16px; }
  `,
  back: css`
    position: absolute; top: 16px; left: 16px; color: var(--colorTextSecondary); font-size: 13px; cursor: pointer; z-index: 10; background: none; border: none;
    &:hover { color: var(--colorText); }
  `,
  hangUpBanner: css`
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(220, 38, 38, 0.95); color: #fff; padding: 20px 32px; border-radius: 16px; font-size: 16px; font-weight: 600; text-align: center; z-index: 20; box-shadow: 0 10px 30px rgba(220,38,38,0.3);
  `,
  panelsWrap: css`
    display: flex; flex-direction: column; gap: 16px; width: 100%;
    @media (min-width: 640px) { flex-direction: row; max-height: 250px; }
  `,
  broadcastBar: css`
    margin-top: 12px;
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(55, 65, 81, 0.5);
    display: grid;
    grid-template-columns: minmax(300px, 1.8fr) 1px minmax(160px, auto) 1px minmax(240px, 2fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
    @media (max-width: 900px) {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1px auto 1px 1fr;
    }
  `,
  bbSection: css`
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    min-width: 0;
    overflow-y: auto;
  `,
  bbCenter: css`
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    min-width: 160px;
  `,
  bbTimerBox: css`
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 12px;
    padding: 10px 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
  `,
  bbDivider: css`
    width: 1px;
    background: rgba(255, 255, 255, 0.06);
    align-self: stretch;
    @media (max-width: 900px) {
      width: 100%;
      height: 1px;
    }
  `,
  bbGoalsTitle: css`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(148, 163, 184, 0.8);
    margin-bottom: 10px;
  `,
  bbGoalItem: css`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    line-height: 1.6;
    transition: color 0.3s ease;
  `,
  bbGoalIcon: css`
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 10px;
    transition: all 0.3s ease;
  `,
  bbChatSection: css`
    padding: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
  `,
  panel: css`
    flex: 1; border-radius: 20px; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s ease; border: 1px solid transparent;
  `,
  panelAi: css`
    background: linear-gradient(160deg, #1e1b4b 0%, #312e81 100%); color: #e0e7ff;
  `,
  panelAiActive: css`
    border-color: rgba(99, 102, 241, 0.4); box-shadow: inset 0 0 60px rgba(99, 102, 241, 0.15);
  `,
  panelUser: css`
    background: linear-gradient(160deg, #064e3b 0%, #14532d 100%); color: #d1fae5;
  `,
  panelUserActive: css`
    border-color: rgba(16, 185, 129, 0.4); box-shadow: inset 0 0 60px rgba(16, 185, 129, 0.15);
  `,
  avatarWrap: css`
    width: 80px; height: 80px; border-radius: 50%; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; overflow: hidden; transition: all 0.3s ease; border: 2px solid transparent;
  `,
  name: css`
    font-size: 16px; font-weight: 600; color: inherit;
  `,
  status: css`
    font-size: 12px; opacity: 0.7; text-transform: uppercase; letter-spacing: 1px;
  `,

  endBtn: css`
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); width: 64px; height: 64px; border-radius: 50%; border: none; background: #ef4444; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4); z-index: 15; transition: transform 0.2s;
    &:hover { transform: translateX(-50%) scale(1.08); }
  `,
  nameDialogMask: css`
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(14px);
  `,
  nameDialogCard: css`
    width: 100%;
    max-width: 520px;
    border-radius: ${cssVar.borderRadiusLG};
    padding: 1px;
    background: linear-gradient(135deg, #111827 0%, #020617 40%, #111827 100%);

    & > div {
      border-radius: ${cssVar.borderRadiusLG};
      background: ${cssVar.colorBgContainer};
      padding: 22px 20px 18px;
    }
  `,
  nameDialogHeader: css`
    display: flex; align-items: flex-start; gap: 16px; margin-bottom: 24px;
  `,
  nameDialogIcon: css`
    width: 32px;
    height: 32px;
    border-radius: 999px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #059669, #10b981);
    color: #ecfdf5;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
  `,
  nameDialogTitle: css`
    font-size: 16px; font-weight: 600; color: var(--colorText); letter-spacing: -0.01em; margin-bottom: 4px;
  `,
  nameDialogDesc: css`
    font-size: 13px; color: var(--colorTextSecondary); line-height: 1.5;
  `,
  nameDialogLabel: css`
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--colorTextTertiary); margin-bottom: 6px; display: block;
  `,
  nameDialogInput: css`
    width: 100%;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.3) !important;
    background: rgba(255, 255, 255, 0.06) !important;
    color: #f9fafb;
    font-size: 14px;
    transition: all 0.16s ease;
    &::placeholder {
      color: rgba(148, 163, 184, 0.9);
    }
    &:focus-visible {
      outline: none;
      border-color: var(--colorPrimary) !important;
      box-shadow: 0 0 0 1px var(--colorPrimaryActive);
      background: rgba(255, 255, 255, 0.09) !important;
    }
  `,
  nameDialogHint: css`
    font-size: 11px; color: var(--colorTextTertiary); margin-top: 6px; line-height: 1.4;
  `,
  nameDialogFooter: css`
    display: flex; justify-content: space-between; align-items: center; margin-top: 18px;
    border-top: 1px solid var(--colorSplit); padding-top: 12px;
  `,
  nameDialogMeta: css`
    font-size: 11px; color: var(--colorTextTertiary); max-width: 60%; line-height: 1.4;
  `,
  nameDialogBtn: css`
    min-width: 0;
    padding: 8px 18px;
    border-radius: 999px;
    border: none;
    background: #059669 !important;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(6, 95, 70, 0.6);
    transition: background-color 0.16s ease, box-shadow 0.16s ease,
      transform 0.1s ease;
    &:hover:not(:disabled) {
      background: #10b981 !important;
      box-shadow: 0 6px 18px rgba(5, 150, 105, 0.75);
      transform: translateY(-0.5px);
    }
    &:active:not(:disabled) {
      transform: translateY(0.5px);
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.5);
    }
    &:disabled {
      background: var(--colorFillQuaternary) !important;
      color: var(--colorTextQuaternary);
      cursor: not-allowed;
      box-shadow: none;
    }
  `,
  nameDialogBtnAlt: css`
    min-width: 0;
    padding: 8px 18px;
    border-radius: 999px;
    border: 1px solid rgba(16, 185, 129, 0.4);
    background: transparent !important;
    color: #10b981;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-right: auto;
    transition: all 0.16s ease;
    &:hover {
      background: rgba(16, 185, 129, 0.1) !important;
      border-color: #10b981;
    }
    &:active {
      transform: translateY(0.5px);
    }
  `,
  analyzingOverlay: css`
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    color: var(--colorText);
    font-size: 16px;
    font-weight: 600;
  `,
  failedWrap: css`
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    display: flex;
    align-items: stretch;
    justify-content: center;
    overflow: hidden;
  `,
  failedChatBg: css`
    position: absolute;
    inset: 0;
    opacity: 0.35;
    filter: blur(0.3px) saturate(0.85);
    pointer-events: none;
    width: 100%;
    height: 100%;
  `,
  failedOverlay: css`
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.9) 100%),
      linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
      linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
    background-size: auto, 100% 4px, 3px 100%;
  `,
  failedCenter: css`
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 18px;
  `,
  failedText: css`
    position: relative;
    z-index: 3;
    margin: auto;
    width: min(860px, calc(100vw - 48px));
    padding: 18px 12px;
    text-align: center;
    line-height: 1.5;
    white-space: pre-line;
  `,
  failedTitle: css`
    margin: 0;
    font-size: clamp(40px, 7vw, 64px);
    font-weight: 900;
    font-style: italic;
    text-transform: uppercase;
    color: #ff4d4f;
    letter-spacing: 8px;
    text-shadow: 0 0 20px rgba(255, 77, 79, 0.6);
    animation: glitch 0.3s 16 alternate, zoomIn 0.4s ease-out;
    @keyframes glitch {
      0% { transform: translate(0, 0); }
      20% { transform: translate(-2px, 2px); }
      40% { transform: translate(-2px, -2px); }
      60% { transform: translate(2px, 2px); }
      80% { transform: translate(2px, -2px); }
      100% { transform: translate(0, 0); }
    }
    @keyframes zoomIn {
      from { transform: scale(2); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    margin-bottom: 12px;
  `,
  failedDesc: css`
    font-size: 14px;
    color: #ffffff;
    opacity: 0.85;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 10px;
  `,
  failedMeta: css`
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 4px 12px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 16px;
  `,
  failedActions: css`
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 18px;
  `,
  actionBtnBase: css`
    min-width: 220px;
    height: 44px;
    padding: 0 18px;
    border-radius: 12px !important;
    font-size: 15px !important;
    font-weight: 700 !important;
  `,
  menuBtn: css`
    border: 1px solid rgba(148, 163, 184, 0.4) !important;
    background: rgba(15, 23, 42, 0.5) !important;
    color: #e2e8f0 !important;
  `,
  analysisBtn: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 220px;
    height: 44px;
    margin-top: 0;
    padding: 10px 20px;
    background: #16ad82;
    color: #ffffff;
    border: 1px solid rgba(16, 185, 129, 0.55);
    border-radius: 10px;
    font-size: 14px;
    font-weight: 300;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

    &:hover:not(:disabled) {
      background: #139870;
      border-color: rgba(16, 185, 129, 0.75);
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.28);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &:disabled {
      background: #86d6c0;
      color: rgba(255, 255, 255, 0.8);
      cursor: not-allowed;
    }
  `,
  analysisLoader: css`
    width: 16px;
    height: 16px;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  `,
  sparkleIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #ffffff;
  `,
}));

const statusLabels: Record<string, string> = {
  connecting: 'Подключение...',
  error: 'Сбой сети',
  idle: 'Ожидание',
  ready: 'Идёт диалог',
};

export interface VoiceCallEndPayload {
  transcript: TranscriptEntry[];
  analysisResult?: {
    overallScore: number;
    competencies: Array<{ name: string; score: number }>;
    summary: string;
    strengths: string[];
    improvements: string[];
    recommendedAction?: string;
    phraseFeedback: Array<{ userPhrase: string; suggestedPhrase: string; advice: string }>;
  };
  sessionId?: string;
  error?: string;
}

export interface GeminiLiveCallProps {
  agentId: string;
  autoConnect?: boolean;
  embedded?: boolean;
  onEnd?: (payload: VoiceCallEndPayload) => void;
  /** Выход с экрана звонка (кнопка в модалке ошибки). */
  onExit?: () => void;
}

const CONNECTION_ERROR_TITLE = 'Ошибка подключения';
const CONNECTION_ERROR_DESC =
  'Не удалось установить соединение с голосовым сервисом. Проверьте подключение к интернету, отключите или настройте VPN, антивирус и прокси. Убедитесь, что сервис Google доступен в вашем регионе.';

const GeminiLiveCall = memo(
  ({ agentId, autoConnect, embedded, onEnd, onExit }: GeminiLiveCallProps) => {
  const navigate = useNavigate();

  const [nickName, username, displayUserName] = useUserStore((s) => [
    userProfileSelectors.nickName(s),
    userProfileSelectors.username(s),
    userProfileSelectors.displayUserName(s),
  ]);
  const profileName = displayUserName || nickName || username || '';

  const [allowAutoConnect, setAllowAutoConnect] = useState(true);
  const [speakerName, setSpeakerName] = useState<string>('');
  const [showNameDialog, setShowNameDialog] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [manualFail, setManualFail] = useState(false);
  const [isBackgroundAnalyzing, setIsBackgroundAnalyzing] = useState(false);
  const [pendingManualPayload, setPendingManualPayload] = useState<VoiceCallEndPayload | null>(null);
  const [analysisText, setAnalysisText] = useState('Анализ интервью');
  const manualFailRef = useRef(false);

  const analyzeTranscript = useCallback(
    async (transcript: TranscriptEntry[]): Promise<VoiceCallEndPayload> => {
      let analysisResult: VoiceCallEndPayload['analysisResult'] | undefined;
      let analyzeError: string | undefined;

      const transcriptForApi = transcript.filter(
        (e) => typeof e?.text === 'string' && e.text.trim().length > 0,
      );
      if (transcriptForApi.length === 0) {
        analyzeError =
          'Нет распознанного текста для анализа. Убедитесь, что микрофон включён и речь попала в транскрипт.';
      }

      try {
        if (!analyzeError) {
          const analyzeRes = await fetch('/api/voice-call/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: transcriptForApi, scenarioId: agentId }),
            credentials: 'include',
          });

          if (!analyzeRes.ok) {
            const errText = await analyzeRes.text();
            let errMsg = 'Ошибка анализа';
            try {
              const errJson = JSON.parse(errText);
              if (errJson?.error) errMsg = errJson.error;
            } catch {
              if (errText) errMsg = errText.slice(0, 200);
            }
            analyzeError = errMsg;
          } else {
            analysisResult = (await analyzeRes.json()) as VoiceCallEndPayload['analysisResult'];
          }
        }
      } catch (e) {
        analyzeError = e instanceof Error ? e.message : 'Ошибка анализа';
      }

      // Сохраняем сессию всегда (даже если анализ не удался — транскрипт ценен сам по себе)
      let sessionId: string | undefined;
      try {
        const saveRes = await fetch('/api/voice-call/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioId: agentId,
            transcript,
            analysisResult: analysisResult ?? null,
          }),
          credentials: 'include',
        });
        const saveData = saveRes.ok ? await saveRes.json().catch(() => null) : null;
        sessionId = saveData?.id as string | undefined;
      } catch (e) {
        console.error('[analyzeTranscript] Failed to save session:', e);
      }

      if (analyzeError) {
        return { transcript, error: analyzeError, sessionId };
      }
      return { transcript, analysisResult, sessionId };
    },
    [agentId],
  );

  const handleConfirmSpeaker = () => {
    const trimmed = speakerName.trim();
    if (!trimmed) return;
    // Сохраняем уже очищенное имя, чтобы передать его в конфиг
    setSpeakerName(trimmed);
    setShowNameDialog(false);
    // Сам вызов connect переносим в эффект, чтобы хук получил обновлённое speakerName
  };

  const handleCallEnd = useCallback(
    async (transcript: TranscriptEntry[]) => {
      setAllowAutoConnect(false);

      if (transcript.length === 0) {
        if (manualFailRef.current) {
          const durationSec = callStartAtRef.current ? Math.floor((Date.now() - callStartAtRef.current) / 1000) : 0;
          if (durationSec > 30) {
            setPendingManualPayload({ transcript: [], error: `Транскрипция не была получена от сервера. Попробуйте ещё раз.` });
          } else {
            setPendingManualPayload({ transcript: [], error: `Разговор завершился слишком быстро (${durationSec} сек.) для анализа.` });
          }
          return;
        }
        if (onEnd) onEnd({ transcript: [] });
        else navigate('/');
        return;
      }

      if (manualFailRef.current) {
        setIsBackgroundAnalyzing(true);
        try {
          const payload = await analyzeTranscript(transcript);
          setPendingManualPayload(payload);
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Ошибка анализа';
          setPendingManualPayload({ transcript, error: errorMessage });
        } finally {
          setIsBackgroundAnalyzing(false);
        }
        return;
      }

      setIsAnalyzing(true);
      try {
        const payload = await analyzeTranscript(transcript);
        if (onEnd) onEnd(payload);
        else navigate('/');
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Ошибка анализа';
        if (onEnd) onEnd({ transcript, error: errorMessage });
        else navigate('/');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [analyzeTranscript, onEnd, navigate],
  );

  const {
    checkpoints,
    clearError,
    connect,
    disconnect,
    errorMessage,
    hangUpByAi,
    hangUpReason,
    status,
    isCallActive,
    userVolume,
    aiVolume,
    score,
    uiConfig,
    getTranscript,
  } = useGeminiLive({
    agentId,
    onCallEnd: handleCallEnd,
    systemInstruction: '',
    voiceName: 'Kore',
    speakerName,
  });

  const [callStartAt, setCallStartAt] = useState<number | null>(null);
  const callStartAtRef = useRef<number | null>(null);

  // Если в сценарии диалог представления отключён — скрываем его и подставляем имя автоматически.
  useEffect(() => {
    if (uiConfig.showIntroDialog === false) {
      setShowNameDialog(false);
      if (!speakerName.trim()) {
        setSpeakerName((profileName || 'Менеджер').trim());
      }
    }
  }, [uiConfig.showIntroDialog, profileName, speakerName]);

  // Отсчёт времени (таймер раунда) начинается только после подключения ИИ (status === 'ready').
  useEffect(() => {
    if (status === 'ready' && !callStartAt) {
      const now = Date.now();
      setCallStartAt(now);
      callStartAtRef.current = now;
    }
    if (status !== 'ready' && status !== 'connecting') {
      setCallStartAt(null);
      callStartAtRef.current = null;
    }
  }, [status, callStartAt]);

  const [barFlash, setBarFlash] = useState<'positive' | 'negative' | null>(null);
  const prevBarScoreRef = useRef(score);
  useEffect(() => {
    const delta = score - prevBarScoreRef.current;
    prevBarScoreRef.current = score;
    if (delta === 0) return;
    setBarFlash(delta > 0 ? 'positive' : 'negative');
    const t = setTimeout(() => setBarFlash(null), 1200);
    return () => clearTimeout(t);
  }, [score]);

  const aiIsSpeaking = aiVolume > 5;
  const userIsSpeaking = userVolume > 10;
  const hangupBannerText =
    hangUpReason === 'success'
      ? 'Время эфира истекло. Интервью завершено.'
      : hangUpReason === 'abuse'
        ? 'Интервью остановлено.'
        : hangUpReason === 'silence'
          ? 'Тренировка завершена из-за долгой паузы.'
          : 'Интервью завершено.';

  // Старт соединения после ввода имени и закрытия попапа
  useEffect(() => {
    if (
      !showNameDialog &&
      allowAutoConnect &&
      status === 'idle' &&
      !hangUpByAi &&
      speakerName.trim()
    ) {
      connect();
    }
  }, [showNameDialog, allowAutoConnect, status, hangUpByAi, speakerName, connect]);

  const handleManualDisconnect = useCallback(() => {
    manualFailRef.current = true;
    setPendingManualPayload(null);
    setIsBackgroundAnalyzing(false);
    setAllowAutoConnect(false);
    setManualFail(true);
    disconnect();
  }, [disconnect]);

  useEffect(() => {
    if (!manualFail) return;

    if (isBackgroundAnalyzing) {
      const phases = [
        'Сбор логов...',
        'Анализ токсичности...',
        'Оценка мимики...',
        'Финальный отчет...',
      ];
      let i = 0;
      setAnalysisText(phases[0]);
      const timer = setInterval(() => {
        i = (i + 1) % phases.length;
        setAnalysisText(phases[i]);
      }, 900);
      return () => clearInterval(timer);
    }

    if (pendingManualPayload) setAnalysisText('Посмотреть анализ');
    else setAnalysisText('Анализ интервью');
  }, [isBackgroundAnalyzing, manualFail, pendingManualPayload]);

  if (manualFail) {
    return (
      <div className={styles.root}>
        <div className={styles.failedWrap}>
          <div className={styles.failedChatBg}>
            <LiveChat score={score} showMessagesAfterTs={null} mode="escape" fullHeight />
          </div>
          <div className={styles.failedOverlay} />
          <div className={styles.failedCenter}>
            <div className={styles.failedText}>
              <h1 className={styles.failedTitle}>СЛИЛСЯ</h1>
              <div className={styles.failedDesc}>
                ИНТЕРВЬЮ ПРЕРВАНО.
                <br />
                СПИКЕР НЕ ВЫВЕЗ ПРЕССИНГА.
              </div>
              <div className={styles.failedMeta}>КРИЗИС УСИЛИЛСЯ. ПОПРОБУЙТЕ ЕЩЕ РАЗ.</div>
              <div className={styles.failedActions}>
                <Button className={`${styles.actionBtnBase} ${styles.menuBtn}`} onClick={() => onExit?.()}>
                  В меню
                </Button>
                <button
                  className={`${styles.actionBtnBase} ${styles.analysisBtn}`}
                  disabled={isBackgroundAnalyzing || !pendingManualPayload}
                  onClick={() => {
                    if (pendingManualPayload) onEnd?.(pendingManualPayload);
                  }}
                >
                  <NeuralNetworkLoading size={36} />
                  <span>{analysisText}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.root}
      style={{
        boxShadow: barFlash === 'negative'
          ? 'inset 0 0 120px rgba(239, 68, 68, 0.18), inset 0 0 300px rgba(239, 68, 68, 0.08)'
          : barFlash === 'positive'
            ? 'inset 0 0 120px rgba(34, 197, 94, 0.15), inset 0 0 300px rgba(34, 197, 94, 0.06)'
            : undefined,
        transition: 'box-shadow 0.5s ease',
      }}
    >
      {barFlash === 'negative' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 120,
            opacity: 0.12,
            pointerEvents: 'none',
            zIndex: 0,
            animation: 'shame-pop 0.8s ease-out forwards',
            userSelect: 'none',
          }}
        >
          😬
        </div>
      )}
      {barFlash === 'positive' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 120,
            opacity: 0.12,
            pointerEvents: 'none',
            zIndex: 0,
            animation: 'shame-pop 0.8s ease-out forwards',
            userSelect: 'none',
          }}
        >
          💪
        </div>
      )}
      <style>{`
        @keyframes shame-pop {
          0% { opacity: 0.25; transform: translate(-50%, -50%) scale(0.5); }
          30% { opacity: 0.18; transform: translate(-50%, -50%) scale(1.2); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
        }
      `}</style>
      {showNameDialog && (
        <div className={styles.nameDialogMask}>
          <div className={styles.nameDialogCard}>
            <div>
            <div className={styles.nameDialogHeader}>
              <div className={styles.nameDialogIcon}>ID</div>
              <div>
                <div className={styles.nameDialogTitle}>
                  {uiConfig.introDialogTitle?.trim() || 'Идентификация агента'}
                </div>
                <div className={styles.nameDialogDesc}>
                  {uiConfig.introDialogDescription?.trim() ||
                    'Введите позывной или реальное имя для старта симуляции. Эта информация будет передана ИИ‑интервьюеру.'}
                </div>
              </div>
            </div>

            <div>
              <div className={styles.nameDialogLabel}>Имя / позывной агента</div>
              <input
                className={styles.nameDialogInput}
                placeholder={
                  uiConfig.introDialogPlaceholder?.trim() ||
                  'Например: Иван Петров или «Маркетолог GFD»'
                }
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
              />
              <div className={styles.nameDialogHint}>
                {uiConfig.introDialogHint?.trim() ||
                  'Можно указать реальное имя или рабочий позывной агента (например, «Маркетолог GFD»).'}
              </div>
            </div>

            <div className={styles.nameDialogFooter}>
              {profileName && (
                <button
                  type="button"
                  className={styles.nameDialogBtnAlt}
                  onClick={() => {
                    setSpeakerName(profileName);
                    setShowNameDialog(false);
                  }}
                >
                  Войти как {profileName}
                </button>
              )}
              <button
                type="button"
                className={styles.nameDialogBtn}
                style={!profileName ? { marginLeft: 'auto' } : undefined}
                disabled={!speakerName.trim()}
                onClick={handleConfirmSpeaker}
              >
                {uiConfig.introDialogButtonLabel?.trim() || 'Начать интервью'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {!embedded && (
        <button className={styles.back} type="button" onClick={() => navigate('/')}>
          ← Выход
        </button>
      )}

      {isAnalyzing && (
        <div className={styles.analyzingOverlay}>
          <span>Анализ интервью…</span>
        </div>
      )}

      {hangUpByAi && <div className={styles.hangUpBanner}>{hangupBannerText}</div>}

      <Modal
        centered
        open={status === 'error' && !!errorMessage}
        title={CONNECTION_ERROR_TITLE}
        width={440}
        onCancel={() => clearError()}
        footer={
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              width: '100%',
            }}
          >
            <Button
              type="primary"
              onClick={() => {
                clearError();
                setShowNameDialog(true);
              }}
            >
              Попробовать снова
            </Button>
            <Button
              onClick={() => {
                clearError();
                onExit?.();
              }}
            >
              Выход
            </Button>
          </div>
        }
      >
        <p style={{ color: 'var(--colorTextSecondary)', margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {CONNECTION_ERROR_DESC}
        </p>
      </Modal>

      <div className={styles.panelsWrap}>
        <div className={`${styles.panel} ${styles.panelAi} ${aiIsSpeaking ? styles.panelAiActive : ''}`}>
          <div
            className={styles.avatarWrap}
            style={{
              borderColor: aiIsSpeaking ? '#818cf8' : 'transparent',
              transform: `scale(${1 + aiVolume / 200})`,
            }}
          >
            <Avatar avatar={DEFAULT_AVATAR} size={64} style={{ background: 'transparent' }} />
          </div>
          <Text className={styles.name}>
            {uiConfig.assistantLabel || VOICE_AGENT_TITLES[agentId] || 'ИИ-агент'}
          </Text>
          <Text className={styles.status}>
            {status === 'ready' ? (aiIsSpeaking ? 'Говорит' : 'Слушает') : statusLabels[status]}
          </Text>
          <EqualizerBars volume={aiVolume} variant="ai" />
        </div>

        <div className={`${styles.panel} ${styles.panelUser} ${userIsSpeaking ? styles.panelUserActive : ''}`}>
          <div
            className={styles.avatarWrap}
            style={{ borderColor: userIsSpeaking ? '#34d399' : 'transparent' }}
          >
            <Icon icon={Mic} size={32} color="#fff" />
          </div>
          <Text className={styles.name}>{speakerName || 'Вы (Менеджер)'}</Text>
          <Text className={styles.status}>
            {isCallActive ? (userIsSpeaking ? 'Говорите' : 'Микрофон активен') : '—'}
          </Text>
          <EqualizerBars volume={userVolume} variant="user" />
        </div>
      </div>

      {isCallActive && (
        <div className={styles.broadcastBar}>
          {/* Левая колонка: цели */}
          <div className={styles.bbSection}>
            <div className={styles.bbGoalsTitle}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx={12} cy={12} r={10} />
                <path d="m9 12 2 2 4-4" />
              </svg>
              Цели разговора
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(uiConfig.goals?.length ? uiConfig.goals : []).map((goal, index) => {
                const cp = checkpoints[index];
                const done = cp?.done;
                return (
                  <div key={index} className={styles.bbGoalItem} style={{ color: done ? '#34d399' : '#94a3b8' }}>
                    <div
                      className={styles.bbGoalIcon}
                      style={{
                        background: done ? 'rgba(52, 211, 153, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                        border: `1px solid ${done ? 'rgba(52, 211, 153, 0.4)' : 'rgba(148, 163, 184, 0.2)'}`,
                        color: done ? '#34d399' : '#64748b',
                      }}
                    >
                      {done ? '✓' : index + 1}
                    </div>
                    <span style={{ fontWeight: done ? 600 : 400 }}>{goal}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.bbDivider} />

          {/* Центральная колонка: таймер + скор */}
          <div className={styles.bbCenter}>
            <div className={styles.bbTimerBox}>
              <RoundTimer
                isCallActive={isCallActive}
                callStartAt={callStartAt}
                hardHangupMs={uiConfig.sessionDurationMs}
              />
            </div>
            <ScoreDisplayBroadcast
              score={score}
              scoreDisplayLabel={uiConfig.scoreDisplayLabel}
              scoreLevelLabels={uiConfig.scoreLevelLabels}
              embedded
            />
          </div>

          <div className={styles.bbDivider} />

          {/* Правая колонка: чат */}
          <div className={styles.bbChatSection}>
            <LiveChat
              score={score}
              showMessagesAfterTs={callStartAt ? callStartAt + 10000 : null}
              embedded
            />
          </div>
        </div>
      )}

      {isCallActive && (
        <button
          className={styles.endBtn}
          type="button"
          onClick={handleManualDisconnect}
          title="Завершить звонок"
        >
          <PhoneOff size={28} />
        </button>
      )}

    </div>
  );
});

GeminiLiveCall.displayName = 'GeminiLiveCall';
export default GeminiLiveCall;
