'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { Button } from 'antd';
import { createStaticStyles } from 'antd-style';
import { BookOpen, Target } from 'lucide-react';
import { memo } from 'react';

const styles = createStaticStyles(({ css, cssVar }) => ({
  wrap: css`
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 16px;

    @media (width <= 640px) {
      padding: 8px 0 16px;
    }
  `,
  title: css`
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  card: css`
    width: 100%;
    padding: 16px;
    margin-bottom: 16px;
    font-size: 14px;
    line-height: 1.6;
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillQuaternary};
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 14px;
  `,
  cardTitle: css`
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 10px;
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
    padding-left: 18px;
  `,
  goalsItem: css`
    margin-bottom: 6px;
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 24px;

    @media (width <= 640px) {
      flex-direction: column;
    }
  `,
  btnPrimary: css`
    min-width: 200px;

    @media (width <= 640px) {
      width: 100%;
    }
  `,
  btnSecondary: css`
    min-width: 160px;

    @media (width <= 640px) {
      width: 100%;
    }
  `,
}));

export interface TrainingLegendScreenProps {
  goals?: string[];
  legend: string;
  mobile?: boolean;
  onEdit?: () => void;
  onStart: () => void;
  title?: string | null;
}

const TrainingLegendScreen = memo<TrainingLegendScreenProps>(
  ({ title, legend, goals = [], onEdit, onStart }) => {
    return (
      <Flexbox className={styles.wrap}>
        {title ? <h1 className={styles.title}>{title}</h1> : null}
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            <BookOpen size={14} />
            <span>Ситуация</span>
          </div>
          <div className={styles.legendText}>{legend}</div>
        </div>
        {goals.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <Target size={14} />
              <span>Ваши задачи</span>
            </div>
            <ul className={styles.goalsList}>
              {goals.map((g, i) => (
                <li key={i} className={styles.goalsItem}>
                  <Text>{g}</Text>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className={styles.actions}>
          <Button className={styles.btnPrimary} size="large" type="primary" onClick={onStart}>
            Начать
          </Button>
          {onEdit && (
            <Button className={styles.btnSecondary} size="large" onClick={onEdit}>
              Редактировать
            </Button>
          )}
        </div>
      </Flexbox>
    );
  },
);

TrainingLegendScreen.displayName = 'TrainingLegendScreen';

export default TrainingLegendScreen;
