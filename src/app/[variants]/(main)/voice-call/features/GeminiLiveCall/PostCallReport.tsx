'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { Progress } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { Award, MessageSquare, Target, TrendingUp } from 'lucide-react';
import { memo } from 'react';

export interface PostCallReportData {
  overallScore: number;
  competencies: Array<{ name: string; score: number }>;
  summary: string;
  strengths: string[];
  improvements: string[];
  phraseFeedback: Array<{
    userPhrase: string;
    suggestedPhrase: string;
    advice: string;
  }>;
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  wrap: css`
    max-width: 560px;
    width: 100%;
    max-height: 85vh;
    overflow-y: auto;
    padding: 4px;
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
    flex: 0 0 160px;
    font-size: 13px;
    color: ${cssVar.colorText};
  `,
  competencyBar: css`
    flex: 1;
    max-width: 200px;
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
}));

export interface PostCallReportProps {
  data: PostCallReportData;
}

const PostCallReport = memo<PostCallReportProps>(({ data }) => {
  const scoreColor =
    data.overallScore >= 70 ? '#22c55e' : data.overallScore >= 40 ? '#eab308' : '#ef4444';

  return (
    <div className={styles.wrap}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <Award size={16} />
          Общий результат
        </div>
        <div className={styles.scoreBig} style={{ color: scoreColor }}>
          {Math.round(data.overallScore)}%
        </div>
        <div className={styles.scoreLabel}>Оценка за диалог</div>
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
                  strokeColor={c.score >= 60 ? '#22c55e' : c.score >= 40 ? '#eab308' : '#ef4444'}
                />
              </div>
              <Text type="secondary" style={{ fontSize: 12, minWidth: 32 }}>
                {c.score}%
              </Text>
            </div>
          ))}
        </div>
      )}

      {data.summary && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <MessageSquare size={16} />
            Резюме
          </div>
          <div className={styles.summaryText}>{data.summary}</div>
        </div>
      )}

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
    </div>
  );
});

PostCallReport.displayName = 'PostCallReport';

export default PostCallReport;
