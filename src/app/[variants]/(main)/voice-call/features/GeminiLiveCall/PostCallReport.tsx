'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { Progress } from 'antd';
import { createStaticStyles } from 'antd-style';
import {
  Activity,
  Award,
  FileText,
  Lightbulb,
  MessageSquare,
  Target,
  TrendingUp,
} from 'lucide-react';
import { memo, useState } from 'react';

import { sanitizeVoiceCallTranscript } from '@/utils/voiceCallEchoFilter';

export interface PostCallReportData {
  behavioralMetrics?: {
    silenceInfo?: string;
    responseSpeed?: string;
    repetitionAndRudeness?: string;
  };
  competencies: Array<{ name: string; score: number }>;
  improvements: string[];
  overallScore: number;
  phraseFeedback: Array<{
    advice: string;
    suggestedPhrase: string;
    userPhrase: string;
  }>;
  recommendedAction?: string;
  strengths: string[];
  summary: string;
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  wrap: css`
    width: 100%;
    padding: 4px;
  `,
  topRow: css`
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
    margin-bottom: 28px;

    @media (min-width: 900px) {
      grid-template-columns: 280px 1fr;
      align-items: start;
    }
  `,
  section: css`
    margin-bottom: 20px;
  `,
  sectionTitle: css`
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  scoreBig: css`
    margin-bottom: 4px;
    font-size: 48px;
    font-weight: 700;
    line-height: 1;
  `,
  scoreLabel: css`
    font-size: 14px;
    color: ${cssVar.colorTextSecondary};
  `,
  competencyRow: css`
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;

    @media (width <= 640px) {
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
  competencyName: css`
    flex: 0 0 200px;
    font-size: 13px;
    color: ${cssVar.colorText};

    @media (width <= 640px) {
      flex: 1 1 100%;
    }
  `,
  competencyBar: css`
    flex: 1;
    max-width: 280px;

    @media (width <= 640px) {
      max-width: none;
      width: 100%;
    }
  `,
  summaryText: css`
    font-size: 14px;
    line-height: 1.6;
    color: ${cssVar.colorText};
    word-break: break-word;
  `,
  list: css`
    padding-left: 18px;
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: ${cssVar.colorText};
  `,
  listItem: css`
    margin-bottom: 6px;
  `,
  phraseCard: css`
    padding: 14px;
    margin-bottom: 12px;
    background: ${cssVar.colorBgContainer};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
  `,
  phraseLabel: css`
    margin-bottom: 4px;
    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
  `,
  phraseText: css`
    margin-bottom: 10px;
    font-size: 14px;
    color: ${cssVar.colorText};
    word-break: break-word;
  `,
  suggestedWrap: css`
    padding-left: 10px;
    margin-top: 8px;
    border-left: 3px solid ${cssVar.colorPrimary};
  `,
  adviceText: css`
    margin-top: 6px;
    font-size: 12px;
    font-style: italic;
    color: ${cssVar.colorTextSecondary};
  `,
  behaviorGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-top: 12px;
  `,
  behaviorCard: css`
    padding: 16px;
    background: ${cssVar.colorBgElevated};
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 12px;
  `,
  behaviorTitle: css`
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
  `,
  behaviorText: css`
    font-size: 14px;
    line-height: 1.5;
    color: ${cssVar.colorText};
    word-break: break-word;
  `,
  transcriptCard: css`
    max-height: 500px;
    padding: 16px;
    margin-top: 12px;
    overflow-y: auto;
    background: ${cssVar.colorBgElevated};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    @media (width <= 640px) {
      max-height: 360px;
      padding: 12px;
    }
  `,
  transcriptMsg: css`
    margin-bottom: 12px;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
  `,
  roleAi: css`
    margin-bottom: 2px;
    font-weight: 600;
    color: ${cssVar.colorInfoText};
  `,
  roleUser: css`
    margin-bottom: 2px;
    font-weight: 600;
    color: ${cssVar.colorSuccessText};
  `,
}));

export interface PostCallReportProps {
  data: PostCallReportData;
  speakerName?: string;
  transcript?: Array<{ role: 'ai' | 'user'; text: string }>;
}

const PostCallReport = memo<PostCallReportProps>(({ data, transcript, speakerName }) => {
  const [showTranscript, setShowTranscript] = useState(false);
  const normalizedTranscript = transcript
    ? sanitizeVoiceCallTranscript(transcript, { mode: 'store' })
    : [];

  const scoreColor =
    data.overallScore >= 70 ? '#22c55e' : data.overallScore >= 40 ? '#eab308' : '#ef4444';

  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        <div>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Award size={16} />
              Общий результат
            </div>
            <div className={styles.scoreBig} style={{ color: scoreColor }}>
              {Math.round(data.overallScore)}%
            </div>
            <div className={styles.scoreLabel}>
              Оценка за диалог
              {speakerName && (
                <>
                  <br />
                  <span style={{ fontWeight: 600 }}>Спикер:</span> {speakerName}
                </>
              )}
            </div>
          </div>

          {data.competencies?.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <Target size={16} />
                Компетенции
              </div>
              {data.competencies.map((c) => (
                <div key={c.name} className={styles.competencyRow}>
                  <span className={styles.competencyName}>{c.name}</span>
                  <div className={styles.competencyBar}>
                    <Progress
                      percent={Math.min(100, Math.max(0, c.score))}
                      size="small"
                      strokeColor={
                        c.score >= 60 ? '#22c55e' : c.score >= 40 ? '#eab308' : '#ef4444'
                      }
                    />
                  </div>
                  <Text style={{ fontSize: 12, minWidth: 32 }} type="secondary">
                    {c.score}%
                  </Text>
                </div>
              ))}
            </div>
          )}
        </div>

        {data.summary && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <MessageSquare size={16} />
              Резюме
            </div>
            <div className={styles.summaryText}>{data.summary}</div>
          </div>
        )}
      </div>

      {data.strengths?.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <TrendingUp size={16} />
            Сильные стороны
          </div>
          <ul className={styles.list}>
            {data.strengths.map((s, i) => (
              <li key={i} className={styles.listItem}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.improvements?.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Области для улучшения</div>
          <ul className={styles.list}>
            {data.improvements.map((s, i) => (
              <li key={i} className={styles.listItem}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.recommendedAction && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Lightbulb size={16} />
            Рекомендация тренера
          </div>
          <div
            className={styles.summaryText}
            style={{
              padding: 12,
              fontStyle: 'italic',
              background: 'var(--colorFillTertiary)',
              borderRadius: 8,
            }}
          >
            {data.recommendedAction}
          </div>
        </div>
      )}

      {data.behavioralMetrics && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Activity size={16} />
            Анализ поведения
          </div>
          <div className={styles.behaviorGrid}>
            {data.behavioralMetrics.silenceInfo && (
              <div className={styles.behaviorCard}>
                <div className={styles.behaviorTitle}>Паузы и молчание</div>
                <div className={styles.behaviorText}>{data.behavioralMetrics.silenceInfo}</div>
              </div>
            )}
            {data.behavioralMetrics.responseSpeed && (
              <div className={styles.behaviorCard}>
                <div className={styles.behaviorTitle}>Скорость реакции</div>
                <div className={styles.behaviorText}>{data.behavioralMetrics.responseSpeed}</div>
              </div>
            )}
            {data.behavioralMetrics.repetitionAndRudeness && (
              <div className={styles.behaviorCard}>
                <div className={styles.behaviorTitle}>Этика и повторяемость</div>
                <div className={styles.behaviorText}>
                  {data.behavioralMetrics.repetitionAndRudeness}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {data.phraseFeedback?.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Построчный разбор реплик</div>
          <Flexbox gap={8} style={{ flexDirection: 'column' }}>
            {data.phraseFeedback.map((p, i) => (
              <div key={i} className={styles.phraseCard}>
                <div className={styles.phraseLabel}>Вы сказали</div>
                <div className={styles.phraseText}>{p.userPhrase}</div>
                <div className={styles.phraseLabel}>Предлагаемый вариант</div>
                <div className={styles.suggestedWrap}>
                  <div className={styles.phraseText}>{p.suggestedPhrase}</div>
                  {p.advice && <div className={styles.adviceText}>{p.advice}</div>}
                </div>
              </div>
            ))}
          </Flexbox>
        </div>
      )}

      {normalizedTranscript.length > 0 && (
        <div className={styles.section}>
          <div
            className={styles.sectionTitle}
            style={{ cursor: 'pointer', color: 'var(--colorPrimary)' }}
            onClick={() => setShowTranscript(!showTranscript)}
          >
            <FileText size={16} />
            {showTranscript ? 'Скрыть полную транскрипцию' : 'Посмотреть полную транскрипцию'}
          </div>

          {showTranscript && (
            <div className={styles.transcriptCard}>
              {normalizedTranscript.map((msg, i) => (
                <div key={i} className={styles.transcriptMsg}>
                  <div className={msg.role === 'ai' ? styles.roleAi : styles.roleUser}>
                    {msg.role === 'ai' ? 'ИИ-агент:' : `${speakerName || 'Вы'}:`}
                  </div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

PostCallReport.displayName = 'PostCallReport';

export default PostCallReport;
