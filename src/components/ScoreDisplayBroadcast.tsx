'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createStyles, useTheme } from 'antd-style';

import type { ScoreLevelLabels } from './ScoreDisplay';

export interface ScoreDisplayBroadcastProps {
  score: number;
  scoreDisplayLabel?: string | null;
  scoreLevelLabels?: ScoreLevelLabels | null;
  /** Показывать [REC] и LIVE. По умолчанию true. */
  showRecLive?: boolean;
}

const DEFAULT_SCORE_LABEL = 'Эфирный прессинг';
const DEFAULT_LEVEL_LOW = 'Провал интервью';
const DEFAULT_LEVEL_MID = 'Напряженная пауза';
const DEFAULT_LEVEL_HIGH = 'Уверенная позиция';

function getLevelLabel(
  score: number,
  scoreLevelLabels?: ScoreLevelLabels | null,
): string {
  if (score < -10) return scoreLevelLabels?.low?.trim() || DEFAULT_LEVEL_LOW;
  if (score > 10) return scoreLevelLabels?.high?.trim() || DEFAULT_LEVEL_HIGH;
  return scoreLevelLabels?.mid?.trim() || DEFAULT_LEVEL_MID;
}

const useStyles = createStyles(({ css, token }) => ({
  root: css`
    position: relative;
    overflow: hidden;
    padding: 12px 16px;
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
    opacity: 0.95;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid ${token.colorBorderSecondary};
    font-family: ${token.fontFamily};
    display: inline-flex;
    flex-direction: column;
    gap: 8px;
    min-width: 240px;
    box-shadow: ${token.boxShadowSecondary};
    transition: all 0.3s ${token.motionEaseInOut};
  `,
  rootGlitch: css`
    animation: lobe-glitch 0.2s ease-in-out infinite;
    border-color: ${token.colorError};
    background: ${token.colorBgContainer};
    box-shadow: 0 0 0 1px ${token.colorError}40;

      @keyframes lobe-glitch {
        0% { transform: translate(0); }
        20% { transform: translate(-1px, 1px); }
        40% { transform: translate(-1px, -1px); }
        60% { transform: translate(1px, 1px); }
        80% { transform: translate(1px, -1px); }
        100% { transform: translate(0); }
      }
    `,
    header: css`
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    `,
    recGroup: css`
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: ${token.fontSizeSM}px;
      font-weight: 600;
      color: ${token.colorTextSecondary};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-variant-numeric: tabular-nums;
    `,
    recDot: css`
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${token.colorError};
      box-shadow: 0 0 8px ${token.colorError};
      animation: rec-pulse 1.5s ease-in-out infinite;

      @keyframes rec-pulse {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.9); }
        100% { opacity: 1; transform: scale(1); }
      }
    `,
    liveBadge: css`
      background: ${token.colorError};
      color: #fff;
      padding: 2px 6px;
      border-radius: ${token.borderRadiusSM}px;
      font-size: ${token.fontSizeSM - 1}px;
      font-weight: 700;
      letter-spacing: 0.04em;
    `,
    label: css`
      font-size: ${token.fontSizeSM}px;
      color: ${token.colorTextDescription};
      font-weight: 500;
    `,
    dataRow: css`
      display: flex;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 4px;
    `,
    value: css`
      font-size: 28px;
      line-height: 1;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      transition: color 0.3s ${token.motionEaseInOut};
    `,
    statusText: css`
      font-size: ${token.fontSize}px;
      font-weight: 600;
      margin-bottom: 4px;
      transition: color 0.3s ${token.motionEaseInOut};
    `,
    barContainer: css`
      width: 100%;
      height: 6px;
      background: ${token.colorFillTertiary};
      border-radius: 10px;
      overflow: hidden;
    `,
    barFill: css`
      height: 100%;
      border-radius: 10px;
      transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1),
        background-color 0.3s ${token.motionEaseInOut};
    `,
}));

export function ScoreDisplayBroadcast({
  score,
  scoreDisplayLabel,
  scoreLevelLabels,
  showRecLive = true,
}: ScoreDisplayBroadcastProps) {
  const { styles, cx } = useStyles();
  const theme = useTheme();
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  const isLow = score < -10;
  const isHigh = score > 10;
  const statusColor = isLow
    ? theme.colorError
    : isHigh
      ? theme.colorSuccess
      : theme.colorWarning;

  const levelLabel = getLevelLabel(score, scoreLevelLabels);
  const normalizedScore = Math.max(-50, Math.min(50, score));
  const progressPercent = ((normalizedScore + 50) / 100) * 100;

  useEffect(() => {
    if (!showRecLive) return;
    if (startRef.current === null) startRef.current = Date.now();
    const t = setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [showRecLive]);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cx(styles.root, isLow && styles.rootGlitch)}>
      {showRecLive && (
        <div className={styles.header}>
          <div className={styles.recGroup}>
            <div className={styles.recDot} />
            <span>[REC] {fmtTime(elapsed)}</span>
          </div>
          <div className={styles.liveBadge}>LIVE</div>
        </div>
      )}

      <div className={styles.label}>
        {scoreDisplayLabel?.trim() || DEFAULT_SCORE_LABEL}
      </div>
      <div className={styles.dataRow}>
        <div className={styles.value} style={{ color: statusColor }}>
          {score > 0 ? `+${score}` : score}
        </div>
        <div style={{ flex: 1, paddingBottom: 4 }}>
          <div className={styles.statusText} style={{ color: statusColor }}>
            {levelLabel}
          </div>
          <div className={styles.barContainer}>
            <div
              className={styles.barFill}
              style={{
                width: `${progressPercent}%`,
                backgroundColor: statusColor,
                boxShadow: `0 0 10px ${statusColor}44`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
