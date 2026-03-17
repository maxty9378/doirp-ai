'use client';

import React from 'react';
import { createStyles } from 'antd-style';

const MIN_BAR_HEIGHT = 4;
const MAX_BAR_HEIGHT = 28;
const BAR_FACTORS = [0.8, 1, 0.6, 1.2, 0.9, 0.7, 1.1, 0.85];

const useStyles = createStyles(({ css }) => ({
  equalizer: css`
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 4px;
    height: ${MAX_BAR_HEIGHT}px;
    margin-top: 8px;
  `,
  bar: css`
    width: 5px;
    min-height: ${MIN_BAR_HEIGHT}px;
    border-radius: 3px;
    transition: height 0.08s ease-out;
  `,
  barAi: css`
    background: #818cf8;
  `,
  barUser: css`
    background: #34d399;
  `,
}));

export interface EqualizerBarsProps {
  volume: number;
  variant: 'ai' | 'user';
}

export const EqualizerBars: React.FC<EqualizerBarsProps> = ({ volume, variant }) => {
  const { styles, cx } = useStyles();
  const barClass = variant === 'ai' ? styles.barAi : styles.barUser;

  return (
    <div className={styles.equalizer}>
      {BAR_FACTORS.map((k, i) => (
        <div
          key={i}
          className={cx(styles.bar, barClass)}
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
};

