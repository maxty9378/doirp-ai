'use client';

import type { VoiceCallSttStatus, VoiceCallTranscriptSource } from '@lobechat/database/schemas';
import { Avatar, Button, Icon, Modal, Text } from '@lobehub/ui';
import { message } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { Mic, PhoneOff } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EqualizerBars } from '@/components/EqualizerBars';
import { LiveChat } from '@/components/LiveChat';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { RoundTimer } from '@/components/RoundTimer';
import { VOICE_AGENT_TITLES } from '@/config/voiceAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { isOfficialGoogleLiveTrainer } from '@/const/voiceCall';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { getVoiceCallDebugSnapshot, type VoiceCallDebugSnapshot } from '@/utils/voiceCallDebug';
import { sanitizeVoiceCallTranscript } from '@/utils/voiceCallEchoFilter';
import { LOCAL_SESSION_PREFIX, saveLocalVoiceCallSession } from '@/utils/voiceCallLocalSessions';

import {
  type GeminiLiveCallEndPayload as GeminiLiveHookEndPayload,
  type TranscriptEntry,
  useGeminiLive,
} from './useGeminiLive';
import { useGeminiLiveOfficial } from './useGeminiLiveOfficial';

const styles = createStaticStyles(({ css }) => ({
  root: css`
    position: relative;

    overflow: hidden;
    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;
    padding: 16px;
    padding-block-end: 72px;

    background: var(--color-bg-layout);

    transition: box-shadow 0.5s ease;

    @media (width <= 640px) {
      padding: 12px;
      padding-block-end: calc(env(safe-area-inset-bottom, 0px) + 84px);
    }

    @media (width >= 640px) {
      padding-block-end: 16px;
    }
  `,
  hangUpBanner: css`
    position: absolute;
    z-index: 20;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    transform: translate(-50%, -50%);

    padding-block: 20px;
    padding-inline: 32px;
    border-radius: 16px;

    font-size: 16px;
    font-weight: 600;
    color: #fff;
    text-align: center;

    background: rgb(220 38 38 / 95%);
    box-shadow: 0 10px 30px rgb(220 38 38 / 30%);
  `,
  panelsWrap: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;

    @media (width >= 640px) {
      flex-direction: row;
      max-height: 250px;
    }
  `,
  broadcastBar: css`
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(300px, 1.8fr) 1px minmax(160px, auto) 1px minmax(240px, 2fr);
    flex: 1;

    min-height: 0;
    margin-block-start: 12px;
    border: 1px solid rgb(55 65 81 / 50%);
    border-radius: 16px;

    background: rgb(15 23 42 / 92%);
    backdrop-filter: blur(12px);

    @media (width <= 900px) {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1px auto 1px 1fr;
    }
  `,
  bbSection: css`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;

    min-width: 0;
    padding-block: 14px;
    padding-inline: 16px;
  `,
  bbCenter: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    justify-content: flex-start;

    min-width: 160px;
    padding-block: 16px;
    padding-inline: 20px;
  `,
  bbTimerBox: css`
    display: flex;
    align-items: center;
    align-self: stretch;
    justify-content: center;

    padding-block: 10px;
    padding-inline: 18px;
    border: 1px solid rgb(239 68 68 / 25%);
    border-radius: 12px;

    background: rgb(239 68 68 / 12%);
  `,
  bbDivider: css`
    align-self: stretch;
    width: 1px;
    background: rgb(255 255 255 / 6%);

    @media (width <= 900px) {
      width: 100%;
      height: 1px;
    }
  `,
  bbGoalsTitle: css`
    display: flex;
    gap: 6px;
    align-items: center;

    margin-block-end: 10px;

    font-size: 11px;
    font-weight: 600;
    color: rgb(148 163 184 / 80%);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  `,
  bbGoalItem: css`
    display: flex;
    gap: 8px;
    align-items: center;

    font-size: 13px;
    line-height: 1.6;

    transition: color 0.3s ease;
  `,
  bbGoalIcon: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 18px;
    height: 18px;
    border-radius: 50%;

    font-size: 10px;

    transition: all 0.3s ease;
  `,
  bbChatSection: css`
    overflow: hidden;
    display: flex;

    min-width: 0;
    min-height: 0;
    padding: 0;
  `,
  panel: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    justify-content: center;

    padding: 20px;
    border: 1px solid transparent;
    border-radius: 20px;

    transition: all 0.3s ease;
  `,
  panelAi: css`
    color: #e0e7ff;
    background: linear-gradient(160deg, #1e1b4b 0%, #312e81 100%);
  `,
  panelAiActive: css`
    border-color: rgb(99 102 241 / 40%);
    box-shadow: inset 0 0 60px rgb(99 102 241 / 15%);
  `,
  panelUser: css`
    color: #d1fae5;
    background: linear-gradient(160deg, #064e3b 0%, #14532d 100%);
  `,
  panelUserActive: css`
    border-color: rgb(16 185 129 / 40%);
    box-shadow: inset 0 0 60px rgb(16 185 129 / 15%);
  `,
  avatarWrap: css`
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;

    width: 80px;
    height: 80px;
    border: 2px solid transparent;
    border-radius: 50%;

    background: rgb(255 255 255 / 10%);

    transition: all 0.3s ease;
  `,
  name: css`
    font-size: 16px;
    font-weight: 600;
    color: inherit;
  `,
  status: css`
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.7;
  `,

  endBtn: css`
    cursor: pointer;

    position: absolute;
    z-index: 15;
    inset-block-end: 24px;
    inset-inline-start: 50%;
    transform: translateX(-50%);

    display: flex;
    align-items: center;
    justify-content: center;

    width: 64px;
    height: 64px;
    border: none;
    border-radius: 50%;

    color: #fff;

    background: #ef4444;
    box-shadow: 0 8px 24px rgb(239 68 68 / 40%);

    transition: transform 0.2s;

    &:hover {
      transform: translateX(-50%) scale(1.08);
    }

    @media (width <= 640px) {
      inset-block-end: calc(env(safe-area-inset-bottom, 0px) + 20px);
      width: 68px;
      height: 68px;
    }
  `,
  nameDialogMask: css`
    position: fixed;
    z-index: 50;
    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    background: rgb(0 0 0 / 50%);
    backdrop-filter: blur(14px);
  `,
  nameDialogCard: css`
    width: 100%;
    max-width: 520px;
    padding: 1px;
    border-radius: ${cssVar.borderRadiusLG};

    background: linear-gradient(135deg, #111827 0%, #020617 40%, #111827 100%);

    & > div {
      padding-block: 22px 18px;
      padding-inline: 20px;
      border-radius: ${cssVar.borderRadiusLG};
      background: ${cssVar.colorBgContainer};
    }

    @media (width <= 640px) {
      max-width: calc(100vw - 24px);
    }
  `,
  nameDialogHeader: css`
    display: flex;
    gap: 16px;
    align-items: flex-start;
    margin-block-end: 24px;
  `,
  nameDialogIcon: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;
    border: none;
    border-radius: 999px;

    font-size: 14px;
    font-weight: 700;
    color: #ecfdf5;

    background: linear-gradient(135deg, #059669, #10b981);
  `,
  nameDialogTitle: css`
    margin-block-end: 4px;

    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: -0.01em;
  `,
  nameDialogDesc: css`
    font-size: 13px;
    line-height: 1.5;
    color: var(--color-text-secondary);
  `,
  nameDialogLabel: css`
    display: block;

    margin-block-end: 6px;

    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.14em;
  `,
  nameDialogInput: css`
    width: 100%;
    padding-block: 10px;
    padding-inline: 14px;
    border: 1px solid rgb(148 163 184 / 30%) !important;
    border-radius: 999px;

    font-size: 14px;
    color: #f9fafb;

    background: rgb(255 255 255 / 6%) !important;

    transition: all 0.16s ease;

    &::placeholder {
      color: rgb(148 163 184 / 90%);
    }

    &:focus-visible {
      border-color: var(--color-primary) !important;
      background: rgb(255 255 255 / 9%) !important;
      outline: none;
      box-shadow: 0 0 0 1px var(--color-primary-active);
    }
  `,
  nameDialogHint: css`
    margin-block-start: 6px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--color-text-tertiary);
  `,
  nameDialogFooter: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    margin-block-start: 18px;
    padding-block-start: 12px;
    border-block-start: 1px solid var(--color-split);

    @media (width <= 640px) {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }
  `,
  nameDialogMeta: css`
    max-width: 60%;
    font-size: 11px;
    line-height: 1.4;
    color: var(--color-text-tertiary);
  `,
  nameDialogBtn: css`
    cursor: pointer;

    min-width: 0;
    padding-block: 8px;
    padding-inline: 18px;
    border: none;
    border-radius: 999px;

    font-size: 13px;
    font-weight: 600;
    color: #fff;

    background: #059669 !important;
    box-shadow: 0 4px 12px rgb(6 95 70 / 60%);

    transition:
      background-color 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.1s ease;

    &:disabled {
      cursor: not-allowed;
      color: var(--color-text-quaternary);
      background: var(--color-fill-quaternary) !important;
      box-shadow: none;
    }

    &:hover:not(:disabled) {
      transform: translateY(-0.5px);
      background: #10b981 !important;
      box-shadow: 0 6px 18px rgb(5 150 105 / 75%);
    }

    &:active:not(:disabled) {
      transform: translateY(0.5px);
      box-shadow: 0 1px 4px rgb(15 23 42 / 50%);
    }
  `,
  nameDialogBtnAlt: css`
    cursor: pointer;

    min-width: 0;
    margin-inline-end: auto;
    padding-block: 8px;
    padding-inline: 18px;
    border: 1px solid rgb(16 185 129 / 40%);
    border-radius: 999px;

    font-size: 13px;
    font-weight: 600;
    color: #10b981;

    background: transparent !important;

    transition: all 0.16s ease;

    &:hover {
      border-color: #10b981;
      background: rgb(16 185 129 / 10%) !important;
    }

    &:active {
      transform: translateY(0.5px);
    }
  `,
  analyzingOverlay: css`
    position: fixed;
    z-index: 40;
    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);

    background: rgb(0 0 0 / 60%);
    backdrop-filter: blur(8px);
  `,
  failedWrap: css`
    position: relative;

    overflow: hidden;
    display: flex;
    align-items: stretch;
    justify-content: center;

    width: 100%;
    height: 100%;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 20px;
  `,
  failedChatBg: css`
    pointer-events: none;

    position: absolute;
    inset: 0;

    width: 100%;
    height: 100%;

    opacity: 0.35;
    filter: blur(0.3px) saturate(0.85);
  `,
  failedOverlay: css`
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle, rgb(0 0 0 / 40%) 0%, rgb(0 0 0 / 90%) 100%),
      linear-gradient(rgb(18 16 16 / 0%) 50%, rgb(0 0 0 / 25%) 50%),
      linear-gradient(90deg, rgb(255 0 0 / 6%), rgb(0 255 0 / 2%), rgb(0 0 255 / 6%));
    background-size:
      auto,
      100% 4px,
      3px 100%;
  `,
  failedCenter: css`
    position: absolute;
    z-index: 2;
    inset: 0;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    padding: 18px;

    text-align: center;
  `,
  failedText: css`
    position: relative;
    z-index: 3;

    width: min(860px, calc(100vw - 48px));
    margin: auto;
    padding-block: 18px;
    padding-inline: 12px;

    line-height: 1.5;
    text-align: center;
    white-space: pre-line;
  `,
  failedTitle: css`
    margin: 0;
    margin-block-end: 12px;

    font-size: clamp(40px, 7vw, 64px);
    font-weight: 900;
    font-style: italic;
    color: #ff4d4f;
    text-shadow: 0 0 20px rgb(255 77 79 / 60%);
    text-transform: uppercase;
    letter-spacing: 8px;

    animation:
      glitch 0.3s 16 alternate,
      zoom-in 0.4s ease-out;

    @keyframes glitch {
      0% {
        transform: translate(0, 0);
      }

      20% {
        transform: translate(-2px, 2px);
      }

      40% {
        transform: translate(-2px, -2px);
      }

      60% {
        transform: translate(2px, 2px);
      }

      80% {
        transform: translate(2px, -2px);
      }

      100% {
        transform: translate(0, 0);
      }
    }

    @keyframes zoom-in {
      from {
        transform: scale(2);
        opacity: 0;
      }

      to {
        transform: scale(1);
        opacity: 1;
      }
    }
  `,
  failedDesc: css`
    margin-block-end: 10px;

    font-size: 14px;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 2px;

    opacity: 0.85;
  `,
  failedMeta: css`
    margin-block-end: 16px;
    padding-block: 4px;
    padding-inline: 12px;
    border: 1px solid rgb(255 255 255 / 20%);
    border-radius: 4px;

    font-size: 11px;
    color: rgb(255 255 255 / 40%);
    text-transform: uppercase;
    letter-spacing: 1px;
  `,
  failedActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;

    margin-block-start: 18px;
  `,
  actionBtnBase: css`
    min-width: 220px;
    height: 44px;
    padding-block: 0;
    padding-inline: 18px;
    border-radius: 12px !important;

    font-size: 15px !important;
    font-weight: 700 !important;
  `,
  menuBtn: css`
    border: 1px solid rgb(148 163 184 / 40%) !important;
    color: #e2e8f0 !important;
    background: rgb(15 23 42 / 50%) !important;
  `,
  analysisBtn: css`
    cursor: pointer;

    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: center;

    min-width: 220px;
    height: 44px;
    margin-block-start: 0;
    padding-block: 10px;
    padding-inline: 20px;
    border: 1px solid rgb(16 185 129 / 55%);
    border-radius: 10px;

    font-size: 14px;
    font-weight: 300;
    color: #fff;

    background: #16ad82;
    box-shadow: 0 1px 2px rgb(0 0 0 / 5%);

    transition: all 0.2s ease;

    &:disabled {
      cursor: not-allowed;
      color: rgb(255 255 255 / 80%);
      background: #86d6c0;
    }

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgb(16 185 129 / 75%);
      background: #139870;
      box-shadow: 0 4px 10px rgb(16 185 129 / 28%);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }
  `,
  analysisLoader: css`
    width: 16px;
    height: 16px;
    border: 2px solid #e5e7eb;
    border-block-start-color: #3b82f6;
    border-radius: 50%;

    animation: spin 0.8s linear infinite;
  `,
  sparkleIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;

    font-size: 16px;
    color: #fff;
  `,
}));

const createLocalSessionId = () =>
  `${LOCAL_SESSION_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const statusLabels: Record<string, string> = {
  connecting: 'Подключение...',
  error: 'Сбой сети',
  idle: 'Ожидание',
  ready: 'Идёт диалог',
};

export interface VoiceCallEndPayload {
  analysisResult?: {
    overallScore: number;
    competencies: Array<{ name: string; score: number }>;
    summary: string;
    strengths: string[];
    improvements: string[];
    recommendedAction?: string;
    behavioralMetrics?: {
      silenceInfo?: string;
      responseSpeed?: string;
      repetitionAndRudeness?: string;
    };
    phraseFeedback: Array<{ userPhrase: string; suggestedPhrase: string; advice: string }>;
  };
  debugLog?: VoiceCallDebugSnapshot | null;
  error?: string;
  sessionId?: string;
  speakerName?: string;
  sttError?: string;
  sttStatus?: VoiceCallSttStatus;
  transcript: TranscriptEntry[];
  transcriptSource?: VoiceCallTranscriptSource;
}

type AnalyzeTranscriptResponse = NonNullable<VoiceCallEndPayload['analysisResult']> & {
  normalizedTranscript?: TranscriptEntry[];
};

interface PostCallSttSegment {
  confidence?: number;
  endTimeMs?: number;
  text: string;
}

interface PostCallTranscribeResponse {
  segments?: PostCallSttSegment[];
  transcriptSource?: VoiceCallTranscriptSource;
}

const normalizeSttSegments = (segments: PostCallSttSegment[] | undefined) =>
  (Array.isArray(segments) ? segments : [])
    .map((segment) => ({
      ...segment,
      text: typeof segment?.text === 'string' ? segment.text.trim() : '',
    }))
    .filter((segment) => segment.text.length > 0);

const mergeTranscriptWithUserSegments = (
  transcript: TranscriptEntry[],
  segments: PostCallSttSegment[],
) => {
  const cleanTranscript = sanitizeVoiceCallTranscript(transcript, { mode: 'store' });
  const normalizedSegments = normalizeSttSegments(segments);

  if (cleanTranscript.length === 0 || normalizedSegments.length === 0) {
    return cleanTranscript;
  }

  const userTexts = normalizedSegments.map((segment) => segment.text);
  const merged: TranscriptEntry[] = [];
  let userIndex = 0;

  for (const entry of cleanTranscript) {
    if (entry.role !== 'user') {
      merged.push(entry);
      continue;
    }

    const replacementText = userTexts[userIndex];
    userIndex += 1;

    if (replacementText) {
      merged.push({ ...entry, text: replacementText });
      continue;
    }

    merged.push(entry);
  }

  while (userIndex < userTexts.length) {
    merged.push({ role: 'user', text: userTexts[userIndex] });
    userIndex += 1;
  }

  return sanitizeVoiceCallTranscript(merged, { mode: 'store' });
};

export interface GeminiLiveCallProps {
  agentId: string;
  autoConnect?: boolean;
  embedded?: boolean;
  layoutMode?: 'desktop' | 'mobile';
  onEnd?: (payload: VoiceCallEndPayload) => void;
  /** Выход с экрана звонка (кнопка в модалке ошибки). */
  onExit?: () => void;
}

const CONNECTION_ERROR_TITLE = 'Ошибка подключения';
const CONNECTION_ERROR_DESC =
  'Не удалось установить соединение с голосовым сервисом. Проверьте подключение к интернету, отключите или настройте VPN, антивирус и прокси. Убедитесь, что сервис Google доступен в вашем регионе.';

const GeminiLiveCall = memo(
  ({
    agentId,
    autoConnect: _autoConnect,
    embedded,
    layoutMode = 'desktop',
    onEnd,
    onExit,
  }: GeminiLiveCallProps) => {
    const navigate = useNavigate();
    const isMobileLayout = layoutMode === 'mobile';
    const useOfficialLiveHook = isOfficialGoogleLiveTrainer(agentId);

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
    const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
    const [pendingManualPayload, setPendingManualPayload] = useState<VoiceCallEndPayload | null>(
      null,
    );
    const [analysisText, setAnalysisText] = useState('Анализ интервью');
    const appendDebugEventRef = useRef<
      ((type: string, data?: Record<string, unknown>) => void) | null
    >(null);
    const manualFailRef = useRef(false);
    const hangUpReasonRef = useRef<string | null>(null);

    const analyzeTranscript = useCallback(
      async ({
        transcript,
        userAudioBlob,
      }: GeminiLiveHookEndPayload): Promise<VoiceCallEndPayload> => {
        let analysisResult: VoiceCallEndPayload['analysisResult'] | undefined;
        let analyzeError: string | undefined;
        let sttError: string | undefined;
        let transcriptSource: VoiceCallTranscriptSource = 'gemini-live-fallback';
        let sttStatus: VoiceCallSttStatus = userAudioBlob ? 'failed' : 'skipped';
        const debugLog = getVoiceCallDebugSnapshot();
        const durationSec = callStartAtRef.current
          ? Math.floor((Date.now() - callStartAtRef.current) / 1000)
          : 0;

        const cleanedTranscript = sanitizeVoiceCallTranscript(transcript, { mode: 'store' });
        let transcriptToStore = cleanedTranscript;

        if (userAudioBlob && userAudioBlob.size > 44) {
          appendDebugEventRef.current?.('stt-uploaded', {
            bytes: userAudioBlob.size,
            mimeType: userAudioBlob.type || 'audio/wav',
          });

          try {
            const formData = new FormData();
            formData.append(
              'audio',
              new File([userAudioBlob], 'voice-call.wav', {
                type: userAudioBlob.type || 'audio/wav',
              }),
            );

            const sttRes = await fetch('/api/voice-call/transcribe', {
              body: formData,
              credentials: 'include',
              method: 'POST',
            });

            if (!sttRes.ok) {
              const errText = await sttRes.text();
              let errMsg = 'Ошибка post-call транскрибации';
              try {
                const errJson = JSON.parse(errText);
                if (errJson?.error) errMsg = errJson.error;
              } catch {
                if (errText) errMsg = errText.slice(0, 200);
              }

              sttError = errMsg;
              sttStatus = 'failed';
              appendDebugEventRef.current?.('stt-failed', { error: errMsg });
            } else {
              const sttPayload = (await sttRes.json()) as PostCallTranscribeResponse;
              const sttSegments = normalizeSttSegments(sttPayload.segments);

              if (sttSegments.length > 0) {
                transcriptToStore = mergeTranscriptWithUserSegments(cleanedTranscript, sttSegments);
                transcriptSource = sttPayload.transcriptSource ?? 'google-stt';
                sttStatus = 'succeeded';
                appendDebugEventRef.current?.('stt-succeeded', {
                  segments: sttSegments.length,
                  transcriptSource,
                });
              } else {
                sttError = 'Google Speech-to-Text вернул пустой результат.';
                sttStatus = 'failed';
                appendDebugEventRef.current?.('stt-failed', { error: sttError });
              }
            }
          } catch (error) {
            sttError = error instanceof Error ? error.message : 'Ошибка post-call транскрибации';
            sttStatus = 'failed';
            appendDebugEventRef.current?.('stt-failed', { error: sttError });
          }
        } else if (userAudioBlob) {
          sttError = 'Не удалось получить валидную запись микрофона для post-call транскрибации.';
          sttStatus = 'failed';
          appendDebugEventRef.current?.('stt-failed', { error: sttError });
        } else {
          appendDebugEventRef.current?.('stt-skipped', { reason: 'missing-user-audio' });
        }

        const transcriptForApi = sanitizeVoiceCallTranscript(transcriptToStore, {
          mode: 'analysis',
        });
        if (transcriptForApi.length === 0) {
          analyzeError =
            'Нет распознанного текста для анализа. Убедитесь, что микрофон включён и речь попала в транскрипт.';
        }

        try {
          if (!analyzeError) {
            const analyzeRes = await fetch('/api/voice-call/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                transcript: transcriptForApi,
                scenarioId: agentId,
                speakerName,
                durationSec,
              }),
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
              const analysisPayload = (await analyzeRes.json()) as AnalyzeTranscriptResponse;
              const llmNormalizedTranscript = Array.isArray(analysisPayload.normalizedTranscript)
                ? sanitizeVoiceCallTranscript(analysisPayload.normalizedTranscript, {
                    mode: 'store',
                  })
                : [];

              if (llmNormalizedTranscript.length > 0) {
                transcriptToStore = llmNormalizedTranscript;
              }

              const { normalizedTranscript: _normalizedTranscript, ...analysisOnly } =
                analysisPayload;
              analysisResult = analysisOnly as VoiceCallEndPayload['analysisResult'];
            }
          }
        } catch (e) {
          analyzeError = e instanceof Error ? e.message : 'Ошибка анализа';
        }

        // Сохраняем сессию всегда (даже если анализ не удался — транскрипт ценен сам по себе)
        let sessionId: string | undefined;
        let saveError: string | undefined;
        try {
          const saveRes = await fetch('/api/voice-call/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenarioId: agentId,
              transcript: transcriptToStore,
              analysisResult: analysisResult ?? null,
              debugLog,
              durationSeconds: durationSec,
              speakerName,
              score: analysisResult?.overallScore ?? null,
              sttError,
              sttStatus,
              transcriptSource,
            }),
            credentials: 'include',
          });
          if (!saveRes.ok) {
            saveError = `HTTP ${saveRes.status}`;
          }
          const saveData = saveRes.ok ? await saveRes.json().catch(() => null) : null;
          sessionId = saveData?.id as string | undefined;
        } catch (e) {
          saveError = e instanceof Error ? e.message : 'Network error';
          console.error('[analyzeTranscript] Failed to save session:', e);
        }

        if (!sessionId) {
          const localId = createLocalSessionId();
          saveLocalVoiceCallSession({
            id: localId,
            scenarioId: agentId,
            transcript: transcriptToStore,
            analysisResult: analysisResult ?? null,
            debugLog,
            score: analysisResult?.overallScore ?? null,
            hangUpReason: hangUpReasonRef.current ?? undefined,
            durationSeconds: durationSec,
            speakerName,
            sttError,
            sttStatus,
            transcriptSource,
            createdAt: new Date().toISOString(),
            localOnly: true,
            saveError,
          });
          sessionId = localId;
        }

        if (sttStatus !== 'succeeded' && sttError) {
          appendDebugEventRef.current?.('stt-fallback', { error: sttError });
          message.warning(
            'Не удалось получить улучшенную post-call транскрибацию. Сохранена резервная версия интервью.',
          );
        }

        if (analyzeError) {
          return {
            transcript: transcriptToStore,
            error: analyzeError,
            sessionId,
            speakerName,
            debugLog,
            sttError,
            sttStatus,
            transcriptSource,
          };
        }
        return {
          transcript: transcriptToStore,
          analysisResult,
          sessionId,
          speakerName,
          debugLog,
          sttError,
          sttStatus,
          transcriptSource,
        };
      },
      [agentId, speakerName],
    );

    const persistDebugOnlySession = useCallback(async () => {
      const debugLog = getVoiceCallDebugSnapshot();
      const durationSec = callStartAtRef.current
        ? Math.floor((Date.now() - callStartAtRef.current) / 1000)
        : 0;

      if (!debugLog?.events?.length || durationSec <= 0) {
        return { debugLog, sessionId: undefined as string | undefined };
      }

      let sessionId: string | undefined;
      let saveError: string | undefined;
      try {
        const saveRes = await fetch('/api/voice-call/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioId: agentId,
            transcript: [],
            debugLog,
            durationSeconds: durationSec,
            speakerName,
            hangUpReason: hangUpReasonRef.current ?? null,
            score: null,
            analysisResult: null,
            sttStatus: 'skipped',
            transcriptSource: 'gemini-live-fallback',
          }),
          credentials: 'include',
        });
        if (!saveRes.ok) {
          saveError = `HTTP ${saveRes.status}`;
        }
        const saveData = saveRes.ok ? await saveRes.json().catch(() => null) : null;
        sessionId = saveData?.id as string | undefined;
      } catch (e) {
        saveError = e instanceof Error ? e.message : 'Network error';
      }

      if (!sessionId) {
        const localId = createLocalSessionId();
        saveLocalVoiceCallSession({
          id: localId,
          scenarioId: agentId,
          transcript: [],
          analysisResult: null,
          debugLog,
          score: null,
          hangUpReason: hangUpReasonRef.current ?? undefined,
          durationSeconds: durationSec,
          speakerName,
          sttStatus: 'skipped',
          transcriptSource: 'gemini-live-fallback',
          createdAt: new Date().toISOString(),
          localOnly: true,
          saveError,
        });
        sessionId = localId;
      }

      return { debugLog, sessionId };
    }, [agentId, speakerName]);

    const handleConfirmSpeaker = () => {
      const trimmed = speakerName.trim();
      if (!trimmed) return;
      // Сохраняем уже очищенное имя, чтобы передать его в конфиг
      setSpeakerName(trimmed);
      setShowNameDialog(false);
      // Сам вызов connect переносим в эффект, чтобы хук получил обновлённое speakerName
    };

    const handleCallEnd = useCallback(
      async ({ transcript, userAudioBlob }: GeminiLiveHookEndPayload) => {
        setAllowAutoConnect(false);

        if (transcript.length === 0) {
          const { debugLog, sessionId } = await persistDebugOnlySession();
          if (manualFailRef.current) {
            const durationSec = callStartAtRef.current
              ? Math.floor((Date.now() - callStartAtRef.current) / 1000)
              : 0;
            if (durationSec > 30) {
              setPendingManualPayload({
                debugLog,
                sessionId,
                transcript: [],
                error: `Транскрипция не была получена от сервера. Попробуйте ещё раз.`,
              });
            } else {
              setPendingManualPayload({
                debugLog,
                sessionId,
                transcript: [],
                error: `Разговор завершился слишком быстро (${durationSec} сек.) для анализа.`,
              });
            }
            return;
          }
          if (onEnd) onEnd({ transcript: [], debugLog, sessionId });
          else navigate(isMobileLayout ? '/training' : '/');
          return;
        }

        if (manualFailRef.current) {
          setIsBackgroundAnalyzing(true);
          try {
            const payload = await analyzeTranscript({ transcript, userAudioBlob });
            setPendingManualPayload(payload);
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Ошибка анализа';
            setPendingManualPayload({
              transcript,
              error: errorMessage,
              debugLog: getVoiceCallDebugSnapshot(),
            });
          } finally {
            setIsBackgroundAnalyzing(false);
          }
          return;
        }

        setIsAnalyzing(true);
        try {
          const payload = await analyzeTranscript({ transcript, userAudioBlob });
          if (onEnd) onEnd(payload);
          else navigate(isMobileLayout ? '/training' : '/');
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Ошибка анализа';
          if (onEnd)
            onEnd({ transcript, error: errorMessage, debugLog: getVoiceCallDebugSnapshot() });
          else navigate(isMobileLayout ? '/training' : '/');
        } finally {
          setIsAnalyzing(false);
        }
      },
      [analyzeTranscript, isMobileLayout, onEnd, navigate, persistDebugOnlySession],
    );

    const legacyLive = useGeminiLive({
      agentId,
      onCallEnd: handleCallEnd,
      systemInstruction: '',
      voiceName: 'Sulafat',
      speakerName,
    });

    const officialLive = useGeminiLiveOfficial({
      agentId,
      onCallEnd: handleCallEnd,
      systemInstruction: '',
      voiceName: 'Sulafat',
      speakerName,
    });

    const {
      appendDebugEvent,
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
    } = useOfficialLiveHook ? officialLive : legacyLive;

    useEffect(() => {
      appendDebugEventRef.current = appendDebugEvent;
      return () => {
        appendDebugEventRef.current = null;
      };
    }, [appendDebugEvent]);

    useEffect(() => {
      hangUpReasonRef.current = hangUpReason ?? null;
    }, [hangUpReason]);

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

    // Старт соединения после ввода имени и закрытия попапа.
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

    useEffect(() => {
      if (!isCallActive) {
        setLiveTranscript([]);
        return;
      }

      const syncTranscript = () => {
        const nextTranscript = getTranscript();
        setLiveTranscript((prev) => {
          if (
            prev.length === nextTranscript.length &&
            prev.every(
              (entry, index) =>
                entry.role === nextTranscript[index]?.role &&
                entry.text === nextTranscript[index]?.text,
            )
          ) {
            return prev;
          }

          return nextTranscript;
        });
      };

      syncTranscript();
      const timer = setInterval(syncTranscript, 500);

      return () => clearInterval(timer);
    }, [getTranscript, isCallActive]);

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
          'Финальный отчёт...',
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
              <LiveChat fullHeight mode="escape" score={score} showMessagesAfterTs={null} />
            </div>
            <div className={styles.failedOverlay} />
            <div className={styles.failedCenter}>
              <div className={styles.failedText}>
                <h1 className={styles.failedTitle}>ПОБЕГ</h1>
                <div className={styles.failedDesc}>
                  ИНТЕРВЬЮ ПРЕРВАНО.
                  <br />
                  СПИКЕР НЕ ВЫВЕЗ ПРЕССИНГА.
                </div>
                <div className={styles.failedMeta}>КРИЗИС УСИЛИЛСЯ. ПОПРОБУЙТЕ ЕЩЕ РАЗ.</div>
                <div className={styles.failedActions}>
                  <Button
                    className={`${styles.actionBtnBase} ${styles.menuBtn}`}
                    onClick={() => onExit?.()}
                  >
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
      <div className={styles.root}>
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
                    value={speakerName}
                    placeholder={
                      uiConfig.introDialogPlaceholder?.trim() ||
                      'Например: Иван Петров или «Маркетолог GFD»'
                    }
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
                      className={styles.nameDialogBtnAlt}
                      type="button"
                      onClick={() => {
                        setSpeakerName(profileName);
                        setShowNameDialog(false);
                      }}
                    >
                      Войти как {profileName}
                    </button>
                  )}
                  <button
                    className={styles.nameDialogBtn}
                    disabled={!speakerName.trim()}
                    style={!profileName ? { marginLeft: 'auto' } : undefined}
                    type="button"
                    onClick={handleConfirmSpeaker}
                  >
                    {uiConfig.introDialogButtonLabel?.trim() || 'Начать интервью'}
                  </button>
                </div>
              </div>
            </div>
          </div>
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
          width={isMobileLayout ? 'calc(100vw - 24px)' : 440}
          footer={
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobileLayout ? '1fr' : '1fr 1fr',
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
          onCancel={() => clearError()}
        >
          <p
            style={{
              color: 'var(--color-text-secondary)',
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {CONNECTION_ERROR_DESC}
          </p>
        </Modal>

        <div className={styles.panelsWrap}>
          <div
            className={`${styles.panel} ${styles.panelAi} ${aiIsSpeaking ? styles.panelAiActive : ''}`}
          >
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
            <EqualizerBars variant="ai" volume={aiVolume} />
          </div>

          <div
            className={`${styles.panel} ${styles.panelUser} ${userIsSpeaking ? styles.panelUserActive : ''}`}
          >
            <div
              className={styles.avatarWrap}
              style={{ borderColor: userIsSpeaking ? '#34d399' : 'transparent' }}
            >
              <Icon color="#fff" icon={Mic} size={32} />
            </div>
            <Text className={styles.name}>{speakerName || 'Вы (Менеджер)'}</Text>
            <Text className={styles.status}>
              {isCallActive ? (userIsSpeaking ? 'Говорите' : 'Микрофон активен') : '—'}
            </Text>
            <EqualizerBars variant="user" volume={userVolume} />
          </div>
        </div>

        {isCallActive && (
          <div className={styles.broadcastBar}>
            {/* Левая колонка: цели */}
            <div className={styles.bbSection}>
              <div className={styles.bbGoalsTitle}>
                <svg
                  fill="none"
                  height={14}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  width={14}
                >
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
                    <div
                      className={styles.bbGoalItem}
                      key={index}
                      style={{ color: done ? '#34d399' : '#94a3b8' }}
                    >
                      <div
                        className={styles.bbGoalIcon}
                        style={{
                          background: done
                            ? 'rgba(52, 211, 153, 0.15)'
                            : 'rgba(148, 163, 184, 0.1)',
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

            {/* Центральная колонка: таймер */}
            <div className={styles.bbCenter} style={{ justifyContent: 'center' }}>
              <div className={styles.bbTimerBox}>
                <RoundTimer
                  callStartAt={callStartAt}
                  hardHangupMs={uiConfig.sessionDurationMs}
                  isCallActive={isCallActive}
                />
              </div>
            </div>

            <div className={styles.bbDivider} />

            {/* Правая колонка: чат */}
            <div className={styles.bbChatSection}>
              <LiveChat
                embedded
                score={score}
                transcript={liveTranscript}
                showMessagesAfterTs={
                  useOfficialLiveHook ? null : callStartAt ? callStartAt + 10000 : null
                }
              />
            </div>
          </div>
        )}

        {isCallActive && (
          <button
            className={styles.endBtn}
            title="Завершить звонок"
            type="button"
            onClick={handleManualDisconnect}
          >
            <PhoneOff size={28} />
          </button>
        )}
      </div>
    );
  },
);

GeminiLiveCall.displayName = 'GeminiLiveCall';
export default GeminiLiveCall;
