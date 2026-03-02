'use client';

import { Avatar, Flexbox, Text } from '@lobehub/ui';
import { Button } from 'antd';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { BookOpen, Mic, Store, Target,User, Volume2 } from 'lucide-react';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { VOICE_CALL_PRESETS } from '@/config/initialAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

import GeminiLiveCall from '../../../../voice-call/features/GeminiLiveCall';
import PostCallReport, { type PostCallReportData } from '../../../../voice-call/features/GeminiLiveCall/PostCallReport';

const VOICE_CALL_AGENT_ID = 'training-tp-price-objection';

/** Fallback: единый текст легенды для озвучки, если в пресете нет scenario_context/user_role/goals */
const LEGEND_FALLBACK =
  'Вы — торговый представитель. Заходите в локальную розничную точку. ' +
  'ЛПР — Марина Ивановна, директор магазина. Она недовольна новым прайсом и готова вывести вашу позицию из матрицы. ' +
  'Ваша задача — отработать возражение «Дорого» в живом голосовом диалоге.';

function speakLegendFallback(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ru-RU';
  u.rate = 0.95;
  const voices = window.speechSynthesis.getVoices();
  const ru = voices.find((v) => v.lang.startsWith('ru'));
  if (ru) u.voice = ru;
  window.speechSynthesis.speak(u);
}

function stopLegendAudio() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  wrap: css`
    width: 100%;
    max-width: 560px;
    padding: 24px;
    padding-bottom: max(10vh, 32px);
  `,
  legend: css`
    color: ${cssVar.colorText};
    font-size: 15px;
    line-height: 1.6;
    white-space: pre-wrap;
    margin-bottom: 24px;
  `,
  card: css`
    background: ${cssVar.colorBgContainer};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 14px;
    color: ${cssVar.colorText};
    font-size: 14px;
    line-height: 1.55;
  `,
  cardTitle: css`
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  goalsList: css`
    margin: 0;
    padding-left: 18px;
  `,
  goalsItem: css`
    margin-bottom: 6px;
  `,
  btn: css`
    min-width: 200px;
  `,
  callWrap: css`
    width: 100%;
    max-width: 720px;
    min-height: 560px;
    height: 70vh;
    border-radius: 16px;
    overflow: hidden;
    background: ${cssVar.colorBgContainer};
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
  `,
  reportWrap: css`
    width: 100%;
    max-width: 560px;
    padding: 24px;
    padding-bottom: max(10vh, 32px);
  `,
  reportTitle: css`
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 16px;
    color: ${cssVar.colorText};
  `,
  reportCloseBtn: css`
    margin-top: 16px;
    padding: 10px 24px;
    border-radius: 8px;
    border: none;
    background: ${cssVar.colorPrimary};
    color: #fff;
    cursor: pointer;
    font-weight: 600;
  `,
}));

interface TranscriptMessage {
  content: string;
  role: 'user' | 'assistant';
}

const VoiceCallOnboarding = memo(() => {
  const meta = useAgentStore(agentSelectors.currentAgentMeta, isEqual);
  const switchTopic = useChatStore((s) => s.switchTopic);
  const [step, setStep] = useState<'enter' | 'legend' | 'call' | 'report'>('enter');
  const [transcriptMessages, setTranscriptMessages] = useState<TranscriptMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [reportData, setReportData] = useState<PostCallReportData | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const legendSpokenRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const legendAudioRef = useRef<HTMLAudioElement | null>(null);

  const preset = VOICE_CALL_PRESETS[VOICE_CALL_AGENT_ID];
  const scenarioContext = preset?.scenario_context;
  const userRole = preset?.user_role;
  const goals = preset?.goals;
  const legendForTts =
    [scenarioContext, userRole, goals?.length ? goals.join('. ') : ''].filter(Boolean).join(' ') ||
    LEGEND_FALLBACK;
  const legendAudioUrl = `/audio/legend-${VOICE_CALL_AGENT_ID}.wav?v=${encodeURIComponent(`${legendForTts.length}`)}`;

  const playLegendAudio = useCallback(() => {
    const audio = legendAudioRef.current || new Audio(legendAudioUrl);
    if (!legendAudioRef.current) legendAudioRef.current = audio;
    audio.src = legendAudioUrl;
    audio.onerror = () => speakLegendFallback(legendForTts);
    audio.currentTime = 0;
    audio.play().catch(() => speakLegendFallback(legendForTts));
  }, [legendAudioUrl, legendForTts]);

  // Озвучить легенду один раз при показе шага «легенда» (Gemini WAV или fallback TTS)
  useEffect(() => {
    if (step !== 'legend') return;
    if (legendSpokenRef.current) return;
    legendSpokenRef.current = true;
    playLegendAudio();
  }, [step, playLegendAudio]);

  // Блокировать ввод в чате LobeChat во время звонка
  useEffect(() => {
    useGlobalStore.setState({ isVoiceCallActive: step === 'call' });
    return () => {
      useGlobalStore.setState({ isVoiceCallActive: false });
    };
  }, [step]);

  // Прокрутка транскрипта к последнему сообщению / стриму
  useEffect(() => {
    if (step !== 'call') return;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [step, transcriptMessages, streamingContent]);

  const handlePlayLegend = useCallback(() => {
    playLegendAudio();
  }, [playLegendAudio]);

  const stopLegend = useCallback(() => {
    stopLegendAudio();
    if (legendAudioRef.current) {
      legendAudioRef.current.pause();
      legendAudioRef.current.currentTime = 0;
    }
  }, []);

  const handleTurnComplete = useCallback((role: 'user' | 'assistant', text: string) => {
    if (!text.trim()) return;
    setTranscriptMessages((prev) => [...prev, { role, content: text.trim() }]);
    setStreamingContent('');
  }, []);

  if (step === 'report') {
    return (
      <Flexbox align={'center'} gap={16} style={{ padding: 16, flexDirection: 'column', width: '100%' }}>
        <div className={styles.reportWrap}>
          <div className={styles.reportTitle}>Послетренинговый отчёт</div>
          {reportLoading ? (
            <div style={{ marginBottom: 16, color: 'var(--colorTextSecondary)' }}>Финализация отчёта...</div>
          ) : reportError ? (
            <div style={{ color: 'var(--colorError)', marginBottom: 16 }}>{reportError}</div>
          ) : reportData ? (
            <PostCallReport data={reportData} />
          ) : null}
          {!reportLoading && (
          <button
            className={styles.reportCloseBtn}
            type="button"
            onClick={() => {
              setReportData(null);
              setReportError(null);
              setReportLoading(false);
              setStep('legend');
            }}
          >
            Закрыть
          </button>
          )}
        </div>
      </Flexbox>
    );
  }

  if (step === 'call') {
    return (
      <Flexbox align={'center'} gap={16} style={{ padding: 16, flexDirection: 'column', width: '100%' }}>
        <div className={styles.callWrap}>
          <GeminiLiveCall
            autoConnect
            embedded
            agentId={VOICE_CALL_AGENT_ID}
            onEnd={() => {
              setTranscriptMessages([]);
              setStreamingContent('');
              setStep('legend');
            }}
          />
        </div>
      </Flexbox>
    );
  }

  return (
    <>
      <Flexbox flex={1} />
      <Flexbox
        align={'center'}
        gap={16}
        style={{ paddingBottom: 'max(10vh, 32px)', flexDirection: 'column' }}
        width={'100%'}
      >
        <Avatar
          avatar={meta.avatar || DEFAULT_AVATAR}
          background={meta.backgroundColor}
          shape={'square'}
          size={78}
        />
        <Text fontSize={32} weight={'bold'}>
          {meta.title || 'Полевой боец: Дорого'}
        </Text>

        {step === 'enter' && (
          <Flexbox align={'center'} className={styles.wrap} gap={16} style={{ flexDirection: 'column' }}>
            <Button
              className={styles.btn}
              icon={<Store />}
              size="large"
              type="primary"
              onClick={() => setStep('legend')}
            >
              Зайти в торговую точку
            </Button>
          </Flexbox>
        )}

        {step === 'legend' && (
          <Flexbox align={'center'} className={styles.wrap} gap={16} style={{ flexDirection: 'column' }}>
            {scenarioContext && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  <BookOpen size={14} />
                  Легенда
                </div>
                <div className={styles.legend}>{scenarioContext}</div>
              </div>
            )}
            {userRole && (
              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  <User size={14} />
                  Роль
                </div>
                <div>{userRole}</div>
              </div>
            )}
            {goals && goals.length > 0 ? (
              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  <Target size={14} />
                  Цели
                </div>
                <ul className={styles.goalsList}>
                  {goals.map((g, i) => (
                    <li className={styles.goalsItem} key={i}>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!scenarioContext && !userRole && (!goals || goals.length === 0) ? (
              <div className={styles.legend}>{LEGEND_FALLBACK}</div>
            ) : null}
            <Flexbox horizontal gap={8} wrap="wrap">
              <Button icon={<Volume2 />} size="large" onClick={handlePlayLegend}>
                Прослушать ещё раз
              </Button>
              <Button size="large" onClick={stopLegend}>
                Пропустить
              </Button>
              <Button
                className={styles.btn}
                icon={<Mic />}
                size="large"
                type="primary"
                onClick={() => {
                  stopLegend();
                  switchTopic(null, { skipRefreshMessage: true });
                  setStep('call');
                }}
              >
                Хорошо, начать
              </Button>
            </Flexbox>
          </Flexbox>
        )}
      </Flexbox>
    </>
  );
});

VoiceCallOnboarding.displayName = 'VoiceCallOnboarding';

export default VoiceCallOnboarding;
