'use client';

import { Avatar, Button, Icon, Modal, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Mic, PhoneOff } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CheckpointsDisplay } from '@/components/CheckpointsDisplay';
import { EqualizerBars } from '@/components/EqualizerBars';
import { LiveChat } from '@/components/LiveChat';
import { RoundTimer } from '@/components/RoundTimer';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { ScoreDisplayBroadcast } from '@/components/ScoreDisplayBroadcast';
import { GFD_STRESS_TRAINING_KEY } from '@/config/training/gfdStressScenario';
import { VOICE_AGENT_TITLES } from '@/config/voiceAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useGeminiLive, type TranscriptEntry } from './useGeminiLive';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const styles = createStaticStyles(({ css }) => ({
  root: css`
    height: 100%; width: 100%; display: flex; flex-direction: column; background: var(--colorBgLayout); padding: 16px; padding-bottom: 72px;
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
    display: flex; flex-direction: column; gap: 16px; width: 100%; max-height: 250px;
    @media (min-width: 640px) { flex-direction: row; }
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
        if (onEnd) onEnd({ transcript: [] });
        else navigate('/');
        return;
      }

      setIsAnalyzing(true);
      try {
        const analyzeRes = await fetch('/api/voice-call/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, scenarioId: agentId }),
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
          if (onEnd) onEnd({ transcript, error: errMsg });
          else navigate('/');
          return;
        }
        const analysisResult = (await analyzeRes.json()) as VoiceCallEndPayload['analysisResult'];

        const saveRes = await fetch('/api/voice-call/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioId: agentId,
            transcript,
            analysisResult,
          }),
          credentials: 'include',
        });
        const saveData = saveRes.ok ? await saveRes.json().catch(() => null) : null;
        const sessionId = saveData?.id as string | undefined;

        if (onEnd) onEnd({ transcript, analysisResult, sessionId });
        else navigate('/');
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Ошибка анализа';
        if (onEnd) onEnd({ transcript, error: errorMessage });
        else navigate('/');
      } finally {
        setIsAnalyzing(false);
      }
    },
    [agentId, onEnd, navigate],
  );

  const {
    checkpoints,
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
    liveTranscript,
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
      setCallStartAt(Date.now());
    }
    if (status !== 'ready' && status !== 'connecting') {
      setCallStartAt(null);
    }
  }, [status, callStartAt]);

  // таймер вынесен в RoundTimer – здесь интервал больше не нужен
  const aiIsSpeaking = aiVolume > 5;
  const userIsSpeaking = userVolume > 10;
  const hangupBannerText =
    hangUpReason === 'success'
      ? 'Время раунда завершилось. Разговор окончен.'
      : hangUpReason === 'abuse'
        ? 'Разговор остановлен из-за оскорблений.'
        : hangUpReason === 'silence'
          ? 'Тренировка завершена из-за долгой паузы.'
          : 'Разговор завершён.';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  // Старт соединения после ввода имени и закрытия попапа
  useEffect(() => {
    if (
      !showNameDialog &&
      allowAutoConnect &&
      status === 'idle' &&
      !hangUpByLpr &&
      speakerName.trim()
    ) {
      connect();
    }
  }, [showNameDialog, allowAutoConnect, status, hangUpByLpr, speakerName, connect]);

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

      {hangUpByLpr && <div className={styles.hangUpBanner}>{hangupBannerText}</div>}

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
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 16,
            border: '1px solid var(--colorBorderSecondary)',
            background: 'var(--colorBgContainer)',
            display: 'flex',
            gap: 16,
          }}
        >
          {/* Левая колонка: цели разговора */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--colorTextSecondary)',
              }}
            >
              Цели разговора
            </span>
            <ul
              style={{
                listStyle: 'disc',
                paddingLeft: 18,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 13,
                color: 'var(--colorTextSecondary)',
              }}
            >
              {(uiConfig.goals?.length ? uiConfig.goals : []).map((goal, index) => {
                const cp = checkpoints[index];
                const done = cp?.done;
                return (
                  <li
                    key={index}
                    style={{
                      color: done ? 'var(--colorSuccessText)' : 'var(--colorTextSecondary)',
                      fontWeight: done ? 600 : 400,
                    }}
                  >
                    {goal}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Центральная колонка: таймер + стресс */}
          <div
            style={{
              flexBasis: 220,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <RoundTimer
              isCallActive={isCallActive}
              callStartAt={callStartAt}
              hardHangupMs={uiConfig.silenceHardHangupMs}
            />
            {agentId === GFD_STRESS_TRAINING_KEY ? (
              <ScoreDisplayBroadcast
                score={score}
                scoreDisplayLabel={uiConfig.scoreDisplayLabel}
                scoreLevelLabels={uiConfig.scoreLevelLabels}
                showRecLive
              />
            ) : (
              <ScoreDisplay
                score={score}
                scoreDisplayLabel={uiConfig.scoreDisplayLabel}
                scoreLevelLabels={uiConfig.scoreLevelLabels}
              />
            )}
          </div>

          {/* Правая колонка: чат зрителей */}
          <div
            style={{
              flexBasis: 260,
              flexShrink: 0,
              minWidth: 0,
            }}
          >
            <LiveChat
                score={score}
                showMessagesAfterTs={callStartAt ? callStartAt + 10000 : null}
              />
          </div>
        </div>
      )}

      {isCallActive && (
        <button className={styles.endBtn} type="button" onClick={disconnect} title="Завершить звонок">
          <PhoneOff size={28} />
        </button>
      )}

    </div>
  );
});

GeminiLiveCall.displayName = 'GeminiLiveCall';
export default GeminiLiveCall;
