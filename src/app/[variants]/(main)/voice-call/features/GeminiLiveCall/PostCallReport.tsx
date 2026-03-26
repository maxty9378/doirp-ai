'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { Progress } from 'antd';
import { createStaticStyles } from 'antd-style';
import { Activity, Award, FileText,Lightbulb, MessageSquare, Target, TrendingUp } from 'lucide-react';
import { memo, useState } from 'react';

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
    userPhrase: string;
    suggestedPhrase: string;
    advice: string;
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
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  scoreBig: css`
    font-size: 48px;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 4px;
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
  `,
  competencyName: css`
    flex: 0 0 200px;
    font-size: 13px;
    color: ${cssVar.colorText};
  `,
  competencyBar: css`
    flex: 1;
    max-width: 280px;
  `,
  summaryText: css`
    font-size: 14px;
    line-height: 1.6;
    color: ${cssVar.colorText};
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
    background: ${cssVar.colorBgContainer};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 12px;
  `,
  phraseLabel: css`
    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    margin-bottom: 4px;
  `,
  phraseText: css`
    font-size: 14px;
    color: ${cssVar.colorText};
    margin-bottom: 10px;
  `,
  suggestedWrap: css`
    border-left: 3px solid ${cssVar.colorPrimary};
    padding-left: 10px;
    margin-top: 8px;
  `,
  adviceText: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    font-style: italic;
    margin-top: 6px;
  `,
  behaviorGrid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin-top: 12px;
  `,
  behaviorCard: css`
    background: ${cssVar.colorBgElevated};
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 12px;
    padding: 16px;
  `,
  behaviorTitle: css`
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  `,
  behaviorText: css`
    font-size: 14px;
    color: ${cssVar.colorText};
    line-height: 1.5;
  `,
  transcriptCard: css`
    background: ${cssVar.colorBgElevated};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    padding: 16px;
    margin-top: 12px;
    max-height: 500px;
    overflow-y: auto;
  `,
  transcriptMsg: css`
    margin-bottom: 12px;
    font-size: 14px;
    line-height: 1.5;
  `,
  roleAi: css`
    font-weight: 600;
    color: ${cssVar.colorInfoText};
    margin-bottom: 2px;
  `,
  roleUser: css`
    font-weight: 600;
    color: ${cssVar.colorSuccessText};
    margin-bottom: 2px;
  `,
}));

export interface PostCallReportProps {
  data: PostCallReportData;
  speakerName?: string;
  transcript?: Array<{ role: 'ai' | 'user'; text: string }>;
}

const PostCallReport = memo<PostCallReportProps>(({ data, transcript, speakerName }) => {
  const [showTranscript, setShowTranscript] = useState(false);

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
              {speakerName && <><br /><span style={{ fontWeight: 600 }}>Спикер:</span> {speakerName}</>}
            </div>
          </div>

          {data.competencies?.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <Target size={16} />
                Компетенции
              </div>
              {data.competencies.map((c) => (
                <div className={styles.competencyRow} key={c.name}>
                  <span className={styles.competencyName}>{c.name}</span>
                  <div className={styles.competencyBar}>
                    <Progress
                      percent={Math.min(100, Math.max(0, c.score))}
                      size="small"
                      strokeColor={c.score >= 60 ? '#22c55e' : c.score >= 40 ? '#eab308' : '#ef4444'}
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
              <li className={styles.listItem} key={i}>
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
              <li className={styles.listItem} key={i}>
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
          <div className={styles.summaryText} style={{ fontStyle: 'italic', background: 'var(--colorFillTertiary)', padding: 12, borderRadius: 8 }}>
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
                <div className={styles.behaviorText}>{data.behavioralMetrics.repetitionAndRudeness}</div>
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
              <div className={styles.phraseCard} key={i}>
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

      {transcript && transcript.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle} style={{ cursor: 'pointer', color: 'var(--colorPrimary)' }} onClick={() => setShowTranscript(!showTranscript)}>
            <FileText size={16} />
            {showTranscript ? 'Скрыть полную транскрипцию' : 'Посмотреть полную транскрипцию'}
          </div>
          
          {showTranscript && (
            <div className={styles.transcriptCard}>
              {transcript.map((msg, i) => (
                <div className={styles.transcriptMsg} key={i}>
                  <div className={msg.role === 'ai' ? styles.roleAi : styles.roleUser}>
                    {msg.role === 'ai' ? 'ИИ-агент:' : (speakerName || 'Вы') + ':'}
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
