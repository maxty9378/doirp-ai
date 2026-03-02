'use client';

import { Avatar, Icon, Text } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { Lightbulb, Loader2, Mic, PhoneOff, X } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DEFAULT_AVATAR } from '@/const/meta';
import PostCallReport, { type PostCallReportData } from './PostCallReport';
import VoiceCallTranscript from './VoiceCallTranscript';
import { useGeminiLive, type TranscriptEntry } from './useGeminiLive';

const MIN_BAR_HEIGHT = 4;
const MAX_BAR_HEIGHT = 28;
const BAR_FACTORS = [0.8, 1, 0.6, 1.2, 0.9, 0.7, 1.1, 0.85];

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
  debriefOverlay: css`
    position: absolute; inset: 0; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 30; padding: 24px;
  `,
  debriefBox: css`
    background: var(--colorBgContainer); border-radius: 16px; padding: 24px; max-width: 500px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.4);
  `,
  debriefTitle: css`
    font-size: 20px; font-weight: 700; margin-bottom: 16px; color: var(--colorText); text-align: center;
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
  equalizer: css`
    display: flex; align-items: flex-end; justify-content: center; gap: 4px; height: ${MAX_BAR_HEIGHT}px; margin-top: 8px;
  `,
  bar: css`
    width: 5px; min-height: ${MIN_BAR_HEIGHT}px; border-radius: 3px; transition: height 0.08s ease-out;
  `,
  barAi: css` background: #818cf8; `,
  barUser: css` background: #34d399; `,

  endBtn: css`
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); width: 64px; height: 64px; border-radius: 50%; border: none; background: #ef4444; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4); z-index: 15; transition: transform 0.2s;
    &:hover { transform: translateX(-50%) scale(1.08); }
  `,
  hintBtn: css`
    position: absolute; bottom: 32px; right: 32px; width: 50px; height: 50px; border-radius: 50%; border: 1px solid rgba(251, 191, 36, 0.3); background: rgba(30, 41, 59, 0.8); backdrop-filter: blur(8px); color: #fbbf24; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; z-index: 15;
    &:hover { background: rgba(251, 191, 36, 0.15); transform: scale(1.05); }
  `,
  hintBox: css`
    position: absolute; bottom: 90px; right: 32px; width: 300px; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(16px); border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 16px; padding: 16px; color: #f8fafc; font-size: 14px; line-height: 1.5; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); z-index: 20;
  `,
  hintHeader: css`
    display: flex; justify-content: space-between; align-items: center; color: #fbbf24; font-weight: 600; margin-bottom: 8px; font-size: 12px; text-transform: uppercase;
  `,
}));

const statusLabels: Record<string, string> = { connecting: 'Подключение...', error: 'Сбой сети', idle: 'Ожидание', ready: 'Идёт диалог' };
const VOICE_CALL_TITLES: Record<string, string> = { 'voice-simulator-lpr': 'ЛПР (Марина Ивановна)', 'training-tp-price-objection': 'ЛПР (Марина Ивановна)' };

function EqualizerBars({ volume, barClass }: { volume: number; barClass: string }) {
  return (
    <div className={styles.equalizer}>
      {BAR_FACTORS.map((k, i) => (
        <div
          key={i}
          className={`${styles.bar} ${barClass}`}
          style={{
            height: Math.max(
              MIN_BAR_HEIGHT,
              MIN_BAR_HEIGHT + (volume / 100) * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) * k,
            ),
          }}
        />
      ))}
    </div>
  );
}

export interface GeminiLiveCallProps {
  agentId: string;
  autoConnect?: boolean;
  embedded?: boolean;
  onEnd?: () => void;
}

const GeminiLiveCall = memo(({ agentId, autoConnect, embedded, onEnd }: GeminiLiveCallProps) => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [showDebrief, setShowDebrief] = useState(false);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [reportData, setReportData] = useState<PostCallReportData | null>(null);
  const [allowAutoConnect, setAllowAutoConnect] = useState(true);

  const [hint, setHint] = useState<string | null>(null);
  const [isHintLoading, setIsHintLoading] = useState(false);

  const handleCallEnd = useCallback(
    async (transcript: TranscriptEntry[]) => {
      setAllowAutoConnect(false);
      if (!transcript.length) {
        if (onEnd) onEnd();
        else navigate('/');
        return;
      }
      setDebriefLoading(true);
      setShowDebrief(true);
      try {
        const res = await fetch('/api/voice-call/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript }),
          credentials: 'include',
        });
        if (res.ok) setReportData(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setDebriefLoading(false);
      }
    },
    [onEnd, navigate],
  );

  const {
    checkpoints,
    connect,
    disconnect,
    errorMessage,
    getTranscript,
    hangUpByLpr,
    hangUpReason,
    status,
    userVolume,
    aiVolume,
    liveTranscript,
    score,
  } = useGeminiLive({
    agentId,
    onCallEnd: handleCallEnd,
    systemInstruction: '',
    voiceName: 'Charon',
  });

  const isCallActive = status === 'connecting' || status === 'ready';
  const aiIsSpeaking = aiVolume > 5;
  const userIsSpeaking = userVolume > 10;
  const hangupBannerText =
    hangUpReason === 'success'
      ? 'ЛПР подтвердил следующий шаг и сам завершил звонок.'
      : hangUpReason === 'abuse'
        ? 'ЛПР услышал оскорбление, пригрозил последствиями и бросил трубку.'
        : hangUpReason === 'silence'
          ? 'ЛПР завершил звонок из-за долгого молчания.'
          : 'ЛПР завершил звонок.';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveTranscript]);

  const fetchHint = useCallback(async () => {
    const tr = getTranscript();
    if (!tr.length) return;
    setIsHintLoading(true);
    try {
      const res = await fetch('/api/voice-call/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: tr }),
        credentials: 'include',
      });
      if (res.ok) setHint((await res.json()).hint);
    } finally {
      setIsHintLoading(false);
    }
  }, [getTranscript]);

  useEffect(() => {
    if (autoConnect && allowAutoConnect && status === 'idle' && !hangUpByLpr) connect();
  }, [autoConnect, allowAutoConnect, status, connect, hangUpByLpr]);

  return (
    <div className={styles.root}>
      {!embedded && (
        <button className={styles.back} type="button" onClick={() => navigate('/')}>
          ← Выход
        </button>
      )}

      {hangUpByLpr && <div className={styles.hangUpBanner}>{hangupBannerText}</div>}

      {errorMessage && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--colorError)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            zIndex: 50,
          }}
        >
          {errorMessage}
        </div>
      )}

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
          <Text className={styles.name}>{VOICE_CALL_TITLES[agentId] || 'ИИ-агент'}</Text>
          <Text className={styles.status}>
            {status === 'ready' ? (aiIsSpeaking ? 'Говорит' : 'Слушает') : statusLabels[status]}
          </Text>
          <EqualizerBars volume={aiVolume} barClass={styles.barAi} />
          {status === 'idle' && (
            <button
              type="button"
              onClick={connect}
              style={{
                marginTop: 8,
                padding: '8px 20px',
                borderRadius: 20,
                border: 'none',
                background: '#22c55e',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Начать диалог
            </button>
          )}
        </div>

        <div className={`${styles.panel} ${styles.panelUser} ${userIsSpeaking ? styles.panelUserActive : ''}`}>
          <div
            className={styles.avatarWrap}
            style={{ borderColor: userIsSpeaking ? '#34d399' : 'transparent' }}
          >
            <Icon icon={Mic} size={32} color="#fff" />
          </div>
          <Text className={styles.name}>Вы (Менеджер)</Text>
          <Text className={styles.status}>
            {isCallActive ? (userIsSpeaking ? 'Говорите' : 'Микрофон активен') : '—'}
          </Text>
          <EqualizerBars volume={userVolume} barClass={styles.barUser} />
        </div>
      </div>

      {isCallActive && (
        <VoiceCallTranscript 
          scrollRef={scrollRef} 
          transcript={liveTranscript} 
          score={score} 
          agentId={agentId} 
          checkpoints={checkpoints}
        />
      )}

      {isCallActive && (
        <button className={styles.endBtn} type="button" onClick={disconnect} title="Завершить звонок">
          <PhoneOff size={28} />
        </button>
      )}

      {isCallActive && (
        <button
          className={styles.hintBtn}
          type="button"
          onClick={fetchHint}
          disabled={isHintLoading}
        >
          {isHintLoading ? (
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Lightbulb size={24} />
          )}
        </button>
      )}

      {hint && isCallActive && (
        <div className={styles.hintBox} role="dialog">
          <div className={styles.hintHeader}>
            <span>Совет тренера</span>
            <X size={16} onClick={() => setHint(null)} style={{ cursor: 'pointer', color: '#94a3b8' }} />
          </div>
          <div style={{ fontStyle: 'italic' }}>«{hint}»</div>
        </div>
      )}

      {showDebrief && (
        <div className={styles.debriefOverlay}>
          <div className={styles.debriefBox}>
            <div className={styles.debriefTitle}>Итоги переговоров</div>
            {debriefLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--colorTextSecondary)' }}>
                <Loader2
                  size={40}
                  style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }}
                />
                <div>ИИ-тренер анализирует ваш диалог...</div>
              </div>
            ) : reportData ? (
              <PostCallReport data={reportData} />
            ) : (
              <div>Нет данных</div>
            )}

            {!debriefLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowDebrief(false);
                    if (onEnd) onEnd();
                    else navigate('/');
                  }}
                  style={{
                    padding: '12px 32px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#3b82f6',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  Завершить тренировку
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

GeminiLiveCall.displayName = 'GeminiLiveCall';
export default GeminiLiveCall;
