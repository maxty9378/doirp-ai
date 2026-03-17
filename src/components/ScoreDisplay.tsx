'use client';

import React, { useEffect, useState } from 'react';
import { createStyles } from 'antd-style';

export interface ScoreLevelLabels {
  low?: string;
  mid?: string;
  high?: string;
}

export interface ScoreDisplayProps {
  /** Подпись индикатора (например «Уровень стресса»). Пусто — дефолт. */
  scoreDisplayLabel?: string | null;
  /** Подписи по уровням счёта: low (score < -10), mid (-10..10), high (> 10). */
  scoreLevelLabels?: ScoreLevelLabels | null;
  score: number;
}

const useStyles = createStyles(({ css }) => ({
  root: css`
    position: relative;
    overflow: hidden;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(10px);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease,
      background-color 0.2s ease;
  `,
  rootDanger: css`
    border-color: rgba(239, 68, 68, 0.5);
    background: rgba(30, 10, 16, 0.9);
    box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.35);
  `,
  rootPositive: css`
    border-color: rgba(16, 185, 129, 0.5);
    background: rgba(5, 46, 32, 0.9);
    box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.3);
  `,
  rootNeutral: css`
    border-color: rgba(245, 158, 11, 0.5);
    background: rgba(31, 32, 16, 0.9);
    box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.3);
  `,
  rootAnimated: css`
    transform: scale(1.05);
  `,
  glowBlob: css`
    position: absolute;
    inset: 0;
    opacity: 0.18;
    filter: blur(18px);
    pointer-events: none;
  `,
  label: css`
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
    position: relative;
    z-index: 1;
  `,
  levelLabel: css`
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    position: relative;
    z-index: 1;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  value: css`
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.03em;
    position: relative;
    z-index: 1;
    font-variant-numeric: tabular-nums;
    transition: color 0.3s ease, text-shadow 0.3s ease;
  `,
  valueDanger: css`
    color: #ef4444;
    filter: drop-shadow(0 0 15px rgba(239, 68, 68, 0.8));
  `,
  valuePositive: css`
    color: #34d399;
    filter: drop-shadow(0 0 15px rgba(52, 211, 153, 0.5));
  `,
  valueNeutral: css`
    color: #fbbf24;
    filter: drop-shadow(0 0 15px rgba(251, 191, 36, 0.5));
  `,
  barOuter: css`
    margin-left: 6px;
    width: 52px;
    height: 4px;
    border-radius: 999px;
    overflow: hidden;
    background: #1f2937;
    position: relative;
    z-index: 1;
  `,
  barInner: css`
    height: 100%;
    border-radius: inherit;
    transition: width 0.7s ease-out, box-shadow 0.7s ease-out, background-color 0.2s ease-out;
  `,
  barDanger: css`
    background-color: #ef4444;
  `,
  barPositive: css`
    background-color: #34d399;
  `,
  barNeutral: css`
    background-color: #fbbf24;
  `,
}));

const DEFAULT_SCORE_LABEL = 'Уровень стресса';
const DEFAULT_LEVEL_LOW = 'Нужно улучшить';
const DEFAULT_LEVEL_MID = 'Неплохо';
const DEFAULT_LEVEL_HIGH = 'Отлично';

function getLevelLabel(
  score: number,
  scoreLevelLabels?: ScoreLevelLabels | null,
): string {
  if (score < -10) return scoreLevelLabels?.low?.trim() || DEFAULT_LEVEL_LOW;
  if (score > 10) return scoreLevelLabels?.high?.trim() || DEFAULT_LEVEL_HIGH;
  return scoreLevelLabels?.mid?.trim() || DEFAULT_LEVEL_MID;
}

export function ScoreDisplay({
  score,
  scoreDisplayLabel,
  scoreLevelLabels,
}: ScoreDisplayProps) {
  const { styles, cx } = useStyles();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(true);
    const timer = setTimeout(() => setAnimate(false), 300);
    return () => clearTimeout(timer);
  }, [score]);

  const normalizedScore = Math.max(-50, Math.min(50, score));
  const progressPercent = ((normalizedScore + 50) / 100) * 100;

  const isPositive = score >= 0;
  const isDanger = score <= -10;

  const sign = score > 0 ? '+' : '';
  const levelLabel = getLevelLabel(score, scoreLevelLabels);

  const rootToneClass = isDanger
    ? styles.rootDanger
    : isPositive
      ? styles.rootPositive
      : styles.rootNeutral;

  const valueToneClass = isDanger
    ? styles.valueDanger
    : isPositive
      ? styles.valuePositive
      : styles.valueNeutral;

  const barToneClass = isDanger
    ? styles.barDanger
    : isPositive
      ? styles.barPositive
      : styles.barNeutral;

  const glowColor = isDanger ? '#7f1d1d' : isPositive ? '#064e3b' : '#78350f';

  return (
    <div className={cx(styles.root, rootToneClass, animate && styles.rootAnimated)}>
      <div className={styles.glowBlob} style={{ backgroundColor: glowColor }} />

      <span className={styles.label}>{scoreDisplayLabel?.trim() || DEFAULT_SCORE_LABEL}</span>
      <span className={cx(styles.levelLabel, valueToneClass)} title={levelLabel}>
        {levelLabel}
      </span>

      <span className={cx(styles.value, valueToneClass)}>
        {sign}
        {score}
      </span>

      <div className={styles.barOuter}>
        <div
          className={cx(styles.barInner, barToneClass)}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

