'use client';

import { Avatar, Flexbox, Text } from '@lobehub/ui';
import { Button } from 'antd';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { BookOpen, CheckCircle2, Mic, ShieldAlert, Store, Target, User, Volume2 } from 'lucide-react';
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
const GEMINI_COVER_URL = '/images/voice-call/field-fighter-cover.svg';

const LEGEND_FALLBACK =
  'Вы - торговый представитель. Вы пришли в локальную торговую точку. ' +
  'ЛПР недоволен новым прайсом и хочет убрать вашу позицию из матрицы. ' +
  'Ваша задача - отработать возражение «Дорого» без прямой скидки и завершить разговор с договоренностью о следующем шаге.';

const CHECKPOINT_FALLBACK = [
  'Снять напряжение и подтвердить, что вы услышали претензию по цене.',
  'Выяснить конкретику: с чем сравнивают цену и где теряется доход.',
  'Доказать выгоду без скидки: маржа, оборачиваемость, сервис и поддержка.',
  'Зафиксировать итог: сохранить матрицу и согласовать следующий шаг.',
];

function speakLegendFallback(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const ruVoice = voices.find((voice) => voice.lang.startsWith('ru'));
  if (ruVoice) utterance.voice = ruVoice;

  window.speechSynthesis.speak(utterance);
}

function stopLegendAudio() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  wrap: css`
    width: 100%;
    max-width: 820px;
    padding: 20px;
    padding-bottom: max(8vh, 28px);
  `,
  legendLayout: css`
    width: 100%;
    display: grid;
    gap: 14px;
    grid-template-columns: 1fr;

    @media (min-width: 900px) {
      grid-template-columns: 1.15fr 0.85fr;
    }
  `,
  cover: css`
    position: relative;
    min-height: 240px;
    border-radius: 18px;
    overflow: hidden;
    background-size: cover;
    background-position: center;
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-shadow: 0 14px 42px rgba(0, 0, 0, 0.22);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  `,
  coverShade: css`
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(8, 14, 27, 0.06) 10%, rgba(8, 14, 27, 0.84) 78%);
  `,
  coverContent: css`
    position: relative;
    z-index: 1;
    padding: 18px;
    color: #f8fafc;
  `,
  coverBadge: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(4px);
  `,
  coverTitle: css`
    margin: 0 0 6px;
    font-size: 24px;
    line-height: 1.2;
    font-weight: 700;
  `,
  coverDesc: css`
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: rgba(241, 245, 249, 0.94);
    max-width: 92%;
  `,
  card: css`
    background: ${cssVar.colorBgContainer};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 14px;
    padding: 16px;
    color: ${cssVar.colorText};
    font-size: 14px;
    line-height: 1.6;
  `,
  cardTitle: css`
    font-size: 12px;
    font-weight: 700;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  legendText: css`
    white-space: pre-wrap;
  `,
  goalsList: css`
    margin: 0;
    padding-left: 18px;
  `,
  goalsItem: css`
    margin-bottom: 7px;
  `,
  checkList: css`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  checkItem: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
  `,
  warning: css`
    margin-top: 10px;
    border-radius: 10px;
    padding: 10px 12px;
    background: rgba(185, 28, 28, 0.1);
    border: 1px solid rgba(185, 28, 28, 0.25);
    font-size: 13px;
    color: ${cssVar.colorText};
  `,
  actions: css`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  `,
  btnPrimary: css`
    min-width: 220px;
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

const VoiceCallOnboarding = memo(() => {
  const meta = useAgentStore(agentSelectors.currentAgentMeta, isEqual);
  const switchTopic = useChatStore((s) => s.switchTopic);
  const [step, setStep] = useState<'enter' | 'legend' | 'call' | 'report'>('enter');
  const [reportData, setReportData] = useState<PostCallReportData | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const legendSpokenRef = useRef(false);
  const legendAudioRef = useRef<HTMLAudioElement | null>(null);

  const preset = VOICE_CALL_PRESETS[VOICE_CALL_AGENT_ID];
  const scenarioContext = preset?.scenario_context;
  const userRole = preset?.user_role;
  const goals = preset?.goals;
  const checkpoints = goals?.length ? goals : CHECKPOINT_FALLBACK;

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

  useEffect(() => {
    if (step !== 'legend') return;
    if (legendSpokenRef.current) return;

    legendSpokenRef.current = true;
    playLegendAudio();
  }, [step, playLegendAudio]);

  useEffect(() => {
    useGlobalStore.setState({ isVoiceCallActive: step === 'call' });
    return () => {
      useGlobalStore.setState({ isVoiceCallActive: false });
    };
  }, [step]);

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

  if (step === 'report') {
    return (
      <Flexbox align={'center'} gap={16} style={{ flexDirection: 'column', padding: 16, width: '100%' }}>
        <div className={styles.reportWrap}>
          <div className={styles.reportTitle}>Послетренинговый отчёт</div>
          {reportLoading ? (
            <div style={{ color: 'var(--colorTextSecondary)', marginBottom: 16 }}>Финализация отчёта...</div>
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
      <Flexbox align={'center'} gap={16} style={{ flexDirection: 'column', padding: 16, width: '100%' }}>
        <div className={styles.callWrap}>
          <GeminiLiveCall
            agentId={VOICE_CALL_AGENT_ID}
            autoConnect
            embedded
            onEnd={() => {
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
        style={{ flexDirection: 'column', paddingBottom: 'max(8vh, 28px)' }}
        width={'100%'}
      >
        <Avatar avatar={meta.avatar || DEFAULT_AVATAR} background={meta.backgroundColor} shape={'square'} size={78} />
        <Text fontSize={32} weight={'bold'}>
          {meta.title || 'Полевой боец: Дорого'}
        </Text>

        {step === 'enter' && (
          <Flexbox align={'center'} className={styles.wrap} gap={16} style={{ flexDirection: 'column' }}>
            <Button
              className={styles.btnPrimary}
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
          <Flexbox align={'center'} className={styles.wrap} gap={14} style={{ flexDirection: 'column' }}>
            <div className={styles.legendLayout}>
              <div className={styles.cover} style={{ backgroundImage: `url(${GEMINI_COVER_URL})` }}>
                <div className={styles.coverShade} />
                <div className={styles.coverContent}>
                  <div className={styles.coverBadge}>Обложка: Gemini style</div>
                  <h2 className={styles.coverTitle}>Легенда тренировки</h2>
                  <p className={styles.coverDesc}>
                    Жёсткие переговоры с ЛПР по возражению «Дорого». Ваша цель: сохранить матрицу без прямой скидки.
                  </p>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  <CheckCircle2 size={14} />
                  Чек-поинты, чтобы диалог дошёл до финала
                </div>
                <ul className={styles.checkList}>
                  {checkpoints.map((checkpoint, index) => (
                    <li className={styles.checkItem} key={index}>
                      <CheckCircle2 size={15} style={{ marginTop: 2, opacity: 0.9 }} />
                      <span>{checkpoint}</span>
                    </li>
                  ))}
                </ul>
                <div className={styles.warning}>
                  <ShieldAlert size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                  Если перейти на оскорбления или хамство, аватар начинает конфликтовать, угрожает проблемами и
                  завершает звонок.
                </div>
              </div>
            </div>

            {scenarioContext && (
              <div className={styles.card} style={{ width: '100%' }}>
                <div className={styles.cardTitle}>
                  <BookOpen size={14} />
                  Легенда
                </div>
                <div className={styles.legendText}>{scenarioContext}</div>
              </div>
            )}

            {userRole && (
              <div className={styles.card} style={{ width: '100%' }}>
                <div className={styles.cardTitle}>
                  <User size={14} />
                  Ваша роль
                </div>
                <div>{userRole}</div>
              </div>
            )}

            {goals && goals.length > 0 ? (
              <div className={styles.card} style={{ width: '100%' }}>
                <div className={styles.cardTitle}>
                  <Target size={14} />
                  Цели тренажёра
                </div>
                <ul className={styles.goalsList}>
                  {goals.map((goal, index) => (
                    <li className={styles.goalsItem} key={index}>
                      {goal}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!scenarioContext && !userRole && (!goals || goals.length === 0) ? (
              <div className={styles.card} style={{ width: '100%' }}>
                <div className={styles.legendText}>{LEGEND_FALLBACK}</div>
              </div>
            ) : null}

            <Flexbox className={styles.actions} horizontal>
              <Button icon={<Volume2 />} size="large" onClick={handlePlayLegend}>
                Прослушать ещё раз
              </Button>
              <Button size="large" onClick={stopLegend}>
                Остановить озвучку
              </Button>
              <Button
                className={styles.btnPrimary}
                icon={<Mic />}
                size="large"
                type="primary"
                onClick={() => {
                  stopLegend();
                  switchTopic(null, { skipRefreshMessage: true });
                  setStep('call');
                }}
              >
                Начать звонок
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
