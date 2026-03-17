'use client';

import React from 'react';
import { createStyles } from 'antd-style';

export interface Checkpoint {
  id: string;
  label: string;
  done: boolean;
}

export interface CheckpointsDisplayProps {
  checkpoints: Checkpoint[];
}

const useStyles = createStyles(({ css }) => ({
  root: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(55, 65, 81, 0.7);
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(10px);
  `,
  titleWrap: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
  `,
  titleIconWrap: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: rgba(79, 70, 229, 0.16);
    border: 1px solid rgba(129, 140, 248, 0.5);
    color: #a5b4fc;
  `,
  counter: css`
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(17, 24, 39, 0.9);
    color: #e5e7eb;
    border: 1px solid rgba(55, 65, 81, 0.9);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  `,
}));

export function CheckpointsDisplay({ checkpoints }: CheckpointsDisplayProps) {
  const { styles, cx } = useStyles();

  if (!checkpoints || checkpoints.length === 0) return null;

  const completedCount = checkpoints.filter((cp) => cp.done).length;
  return (
    <div className={styles.root}>
      <div className={styles.titleWrap}>
        <div className={styles.titleIconWrap}>
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <span>Цели разговора</span>
      </div>

      <span className={styles.counter}>
        {completedCount} / {checkpoints.length}
      </span>
    </div>
  );
}


