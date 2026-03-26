'use client';

import { Avatar, Flexbox, Text } from '@lobehub/ui';
import { Button } from 'antd';
import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { BookOpen, CheckCircle2, Mic, Store, Target, User, Volume2 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { VOICE_CALL_PRESETS } from '@/config/initialAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useTrainingBannerUrl } from '@/hooks/useTrainingBannerUrl';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import GeminiLiveCall from '../../../../voice-call/features/GeminiLiveCall';
import PostCallReport, {
  type PostCallReportData,
} from '../../../../voice-call/features/GeminiLiveCall/PostCallReport';

const VOICE_CALL_AGENT_ID = 'training-tp-price-objection';

const LEGEND_FALLBACK =
  'Вы - торговый представитель. Вы пришли в локальную торговую точку. ' +
  'Директор магазина недоволен новым прайсом и хочет убрать вашу позицию из матрицы. ' +
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

const dedupe = (items: string[]) =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const styles = createStaticStyles(({ css, cssVar }) => ({
  page: css`
    position: relative;
    overflow: hidden;
    width: 100%;
    min-height: 100%;

    &::before {
      pointer-events: none;
      content: '';

      position: absolute;
      inset: 0;

      background:
        radial-gradient(900px 360px at 12% 0%, rgb(59 130 246 / 8%), transparent 60%),
        radial-gradient(900px 360px at 88% 0%, rgb(16 185 129 / 7%), transparent 64%);
    }
  `,
  shell: css`
    position: relative;
    z-index: 1;

    display: flex;
    flex-direction: column;
    gap: 14px;

    width: 100%;
    max-width: 1320px;
    margin-block: 0;
    margin-inline: auto;
    padding: 20px;
    padding-block-end: max(8vh, 28px);

    @media (width >= 1200px) {
      padding-inline: 28px;
    }
  `,
  heading: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 14px;

    background: ${cssVar.colorBgContainer};
    backdrop-filter: blur(2px);
  `,
  headingTitle: css`
    margin: 0;
    font-size: clamp(24px, 3vw, 34px);
    font-weight: 700;
    line-height: 1.2;
  `,
  headingDesc: css`
    margin: 0;
    color: ${cssVar.colorTextSecondary};
  `,
  enterCard: css`
    width: 100%;
    padding: 18px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};
  `,
  legendLayout: css`
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    width: 100%;

    @media (width >= 1080px) {
      grid-template-columns: 1.35fr 0.65fr;
      align-items: start;
    }
  `,
  cover: css`
    position: relative;

    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;

    min-height: 280px;
    border: 1px solid rgb(255 255 255 / 20%);
    border-radius: 18px;

    background-position: center;
    background-size: cover;
    box-shadow: 0 14px 40px rgb(0 0 0 / 18%);
  `,
  coverShade: css`
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgb(8 14 27 / 10%) 12%, rgb(8 14 27 / 84%) 78%);
  `,
  coverContent: css`
    position: relative;
    z-index: 1;
    padding: 18px;
    color: #f8fafc;
  `,
  coverBadge: css`
    display: inline-flex;
    gap: 6px;
    align-items: center;

    margin-block-end: 8px;
    padding-block: 4px;
    padding-inline: 10px;
    border: 1px solid rgb(255 255 255 / 35%);
    border-radius: 999px;

    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;

    background: rgb(15 23 42 / 50%);
    backdrop-filter: blur(4px);
  `,
  coverTitle: css`
    margin-block: 0 6px;
    margin-inline: 0;

    font-size: 26px;
    font-weight: 700;
    line-height: 1.2;
  `,
  coverDesc: css`
    max-width: 92%;
    margin: 0;

    font-size: 14px;
    line-height: 1.55;
    color: rgb(241 245 249 / 94%);
  `,
  card: css`
    width: 100%;
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 14px;

    font-size: 14px;
    line-height: 1.6;
    color: ${cssVar.colorText};

    background: ${cssVar.colorFillQuaternary};
    box-shadow: 0 1px 0 rgb(255 255 255 / 3%) inset;
  `,
  sectionsGrid: css`
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    width: 100%;

    @media (width >= 1080px) {
      grid-template-columns: 1fr 1fr;
    }
  `,
  sectionFull: css`
    @media (width >= 1080px) {
      grid-column: 1 / -1;
    }
  `,
  cardTitle: css`
    display: flex;
    gap: 8px;
    align-items: center;

    margin-block-end: 10px;

    font-size: 12px;
    font-weight: 700;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  legendText: css`
    white-space: pre-wrap;
  `,
  goalsList: css`
    margin: 0;
    padding-inline-start: 18px;
  `,
  goalsItem: css`
    margin-block-end: 7px;
  `,
  checkList: css`
    display: flex;
    flex-direction: column;
    gap: 8px;

    margin: 0;
    padding: 0;

    list-style: none;
  `,
  checkItem: css`
    display: flex;
    gap: 8px;
    align-items: flex-start;
  `,
  actionsDock: css`
    position: sticky;
    z-index: 12;
    inset-block-end: 10px;

    width: 100%;
    margin-block-start: 2px;
    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: color-mix(in srgb, ${cssVar.colorBgContainer} 88%, transparent);
    backdrop-filter: blur(8px);
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-start;

    width: 100%;

    @media (width < 768px) {
      > button {
        width: 100%;
      }
    }
  `,
  btnPrimary: css`
    min-width: 240px;
  `,
  callWrap: css`
    overflow: hidden;

    width: 100%;
    max-width: 1280px;
    height: clamp(600px, 80vh, 920px);
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};
    box-shadow: 0 12px 32px rgb(0 0 0 / 10%);
  `,
  reportWrap: css`
    width: 100%;
    max-width: 1080px;
    padding: 24px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 14px;

    background: ${cssVar.colorBgContainer};
  `,
  reportTitle: css`
    margin-block-end: 16px;
    font-size: 20px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  reportCloseBtn: css`
    cursor: pointer;

    margin-block-start: 16px;
    padding-block: 10px;
    padding-inline: 24px;
    border: none;
    border-radius: 8px;

    font-weight: 600;
    color: #fff;

    background: ${cssVar.colorPrimary};
  `,
}));

const VoiceCallOnboarding = memo(() => {
  const meta = useAgentStore(agentSelectors.currentAgentMeta, isEqual);
  const trainerBannerUrl = useTrainingBannerUrl();
  const wideScreen = useGlobalStore(systemStatusSelectors.wideScreen);
  const switchTopic = useChatStore((s) => s.switchTopic);
  const [step, setStep] = useState<'enter' | 'legend' | 'call' | 'report'>('enter');
  const [reportData, setReportData] = useState<PostCallReportData | null>(null);
  const [reportTranscript, setReportTranscript] = useState<any[]>([]);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const legendAudioRef = useRef<HTMLAudioElement | null>(null);

  const preset = VOICE_CALL_PRESETS[VOICE_CALL_AGENT_ID];
  const scenarioContext = preset?.scenario_context;
  const userRole = preset?.user_role;
  const goals = preset?.goals;

  const keyPoints = useMemo(() => dedupe([...(goals || []), ...CHECKPOINT_FALLBACK]), [goals]);

  const legendForTts = useMemo(
    () =>
      [scenarioContext, userRole, keyPoints.join('. ')].filter(Boolean).join(' ') ||
      LEGEND_FALLBACK,
    [keyPoints, scenarioContext, userRole],
  );

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
      <Flexbox className={styles.page} width={'100%'}>
        <div className={styles.shell} style={wideScreen ? { maxWidth: '100%' } : undefined}>
          <div className={styles.reportWrap} style={wideScreen ? { maxWidth: '100%' } : undefined}>
            <div className={styles.reportTitle}>Послетренинговый отчёт</div>
            {reportLoading ? (
              <div style={{ color: 'var(--colorTextSecondary)', marginBottom: 16 }}>
                Финализация отчёта...
              </div>
            ) : reportError ? (
              <div style={{ color: 'var(--colorError)', marginBottom: 16 }}>{reportError}</div>
            ) : reportData ? (
              <PostCallReport data={reportData} transcript={reportTranscript} />
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
        </div>
      </Flexbox>
    );
  }

  if (step === 'call') {
    return (
      <Flexbox className={styles.page} width={'100%'}>
        <div className={styles.shell} style={wideScreen ? { maxWidth: '100%' } : undefined}>
          <div className={styles.callWrap} style={wideScreen ? { maxWidth: '100%' } : undefined}>
            <GeminiLiveCall
              autoConnect
              embedded
              agentId={VOICE_CALL_AGENT_ID}
              onEnd={(payload) => {
                if (payload.analysisResult) {
                  setReportData(payload.analysisResult);
                }
                if (payload.transcript) {
                  setReportTranscript(payload.transcript);
                }
                if (payload.error) {
                  setReportError(payload.error);
                }
                setStep('report');
              }}
            />
          </div>
        </div>
      </Flexbox>
    );
  }

  return (
    <Flexbox className={styles.page} width={'100%'}>
      <div className={styles.shell} style={wideScreen ? { maxWidth: '100%' } : undefined}>
        <div className={styles.heading}>
          <Avatar
            avatar={meta.avatar || DEFAULT_AVATAR}
            background={meta.backgroundColor}
            shape={'square'}
            size={72}
          />
          <div>
            <h1 className={styles.headingTitle}>{meta.title || 'Полевой боец: Дорого'}</h1>
            <p className={styles.headingDesc}>
              Тренировка переговоров по возражению «Дорого».
            </p>
          </div>
        </div>

        {step === 'enter' && (
          <div className={styles.enterCard}>
            <Flexbox gap={12}>
              <Text type={'secondary'}>
                Перед звонком изучите легенду и ключевые ориентиры. После этого запустите диалог.
              </Text>
              <Flexbox horizontal>
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
            </Flexbox>
          </div>
        )}

        {step === 'legend' && (
          <Flexbox gap={14}>
            <div className={styles.legendLayout}>
              <div className={styles.cover} style={{ backgroundImage: `url(${trainerBannerUrl})` }}>
                <div className={styles.coverShade} />
                <div className={styles.coverContent}>
                  <div className={styles.coverBadge}>Тренировочный сценарий</div>
                  <h2 className={styles.coverTitle}>Легенда тренировки</h2>
                  <p className={styles.coverDesc}>
                    Жёсткие переговоры по возражению «Дорого». Ваша цель: сохранить матрицу
                    без прямой скидки.
                  </p>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>
                  <CheckCircle2 size={14} />
                  Ключевые ориентиры тренировки
                </div>
                <ul className={styles.checkList}>
                  {keyPoints.map((point, index) => (
                    <li className={styles.checkItem} key={index}>
                      <CheckCircle2 size={15} style={{ marginTop: 2, opacity: 0.9 }} />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={styles.sectionsGrid}>
              {userRole && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>
                    <User size={14} />
                    Ваша роль
                  </div>
                  <div>{userRole}</div>
                </div>
              )}

              {goals && goals.length > 0 && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>
                    <Target size={14} />
                    Цели
                  </div>
                  <ul className={styles.goalsList}>
                    {goals.map((goal, index) => (
                      <li className={styles.goalsItem} key={index}>
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {scenarioContext && (
                <div className={`${styles.card} ${styles.sectionFull}`}>
                  <div className={styles.cardTitle}>
                    <BookOpen size={14} />
                    Легенда
                  </div>
                  <div className={styles.legendText}>{scenarioContext}</div>
                </div>
              )}

              {!scenarioContext && !userRole && (!goals || goals.length === 0) ? (
                <div className={`${styles.card} ${styles.sectionFull}`}>
                  <div className={styles.legendText}>{LEGEND_FALLBACK}</div>
                </div>
              ) : null}
            </div>

            <div className={styles.actionsDock}>
              <Flexbox horizontal className={styles.actions}>
                <Button icon={<Volume2 />} size="large" onClick={handlePlayLegend}>
                  Плей легенду
                </Button>
                <Button size="large" onClick={stopLegend}>
                  Стоп легенды
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
            </div>
          </Flexbox>
        )}
      </div>
    </Flexbox>
  );
});

VoiceCallOnboarding.displayName = 'VoiceCallOnboarding';

export default VoiceCallOnboarding;
