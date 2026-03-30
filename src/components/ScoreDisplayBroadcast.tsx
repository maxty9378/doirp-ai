'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { ScoreLevelLabels } from './ScoreDisplay';

export interface ScoreDisplayBroadcastProps {
  embedded?: boolean;
  score: number;
  scoreDisplayLabel?: string | null;
  scoreLevelLabels?: ScoreLevelLabels | null;
}

const DEFAULT_SCORE_LABEL = 'РЕЗУЛЬТАТ';
const DEFAULT_LEVEL_LOW = 'Провал интервью';
const DEFAULT_LEVEL_MID = 'Напряжённая пауза';
const DEFAULT_LEVEL_HIGH = 'Уверенная позиция';

function getLevelLabel(score: number, scoreLevelLabels?: ScoreLevelLabels | null): string {
  if (score < -10) return scoreLevelLabels?.low?.trim() || DEFAULT_LEVEL_LOW;
  if (score > 10) return scoreLevelLabels?.high?.trim() || DEFAULT_LEVEL_HIGH;
  return scoreLevelLabels?.mid?.trim() || DEFAULT_LEVEL_MID;
}

function getLevelEmoji(score: number): string {
  if (score < -10) return '🔥';
  if (score > 10) return '💪';
  return '⚠️';
}

export function ScoreDisplayBroadcast({
  score,
  scoreDisplayLabel,
  scoreLevelLabels,
  embedded = false,
}: ScoreDisplayBroadcastProps) {
  const [flash, setFlash] = useState<'positive' | 'negative' | null>(null);
  const prevScoreRef = useRef(score);

  useEffect(() => {
    const delta = score - prevScoreRef.current;
    prevScoreRef.current = score;
    if (delta === 0) return;
    setFlash(delta > 0 ? 'positive' : 'negative');
    const t = setTimeout(() => setFlash(null), 800);
    return () => clearTimeout(t);
  }, [score]);

  const isLow = score < -10;
  const isHigh = score > 10;
  const statusColor = isLow ? '#ef4444' : isHigh ? '#22c55e' : '#f59e0b';
  const levelLabel = getLevelLabel(score, scoreLevelLabels);
  const levelEmoji = getLevelEmoji(score);
  const normalizedScore = Math.max(-50, Math.min(50, score));
  const progressPercent = ((normalizedScore + 50) / 100) * 100;

  const flashBg =
    flash === 'negative'
      ? 'rgba(239, 68, 68, 0.15)'
      : flash === 'positive'
        ? 'rgba(34, 197, 94, 0.15)'
        : 'transparent';

  const label = (scoreDisplayLabel?.trim() || DEFAULT_SCORE_LABEL).toUpperCase();

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        background: flashBg,
        borderRadius: embedded ? 0 : 12,
        transition: 'background 0.4s ease',
        padding: embedded ? 0 : '12px 16px',
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          color: 'rgba(148, 163, 184, 0.7)',
          textTransform: 'uppercase' as const,
          marginBottom: 8,
        }}
      >
        {label}
      </div>

      {/* Status + emoji */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 14 }}>{levelEmoji}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: statusColor,
            transition: 'color 0.3s ease',
          }}
        >
          {levelLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: '100%',
          height: 5,
          background: 'rgba(255, 255, 255, 0.06)',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progressPercent}%`,
            borderRadius: 10,
            backgroundColor: statusColor,
            boxShadow: `0 0 12px ${statusColor}66`,
            transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s ease',
          }}
        />
      </div>

      {/* Score value — big at the bottom */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 36,
            fontWeight: 900,
            lineHeight: 1,
            color: statusColor,
            fontVariantNumeric: 'tabular-nums',
            transition: 'color 0.3s ease',
            textShadow: flash
              ? `0 0 20px ${flash === 'negative' ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'}`
              : 'none',
          }}
        >
          {score > 0 ? `+${score}` : score}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(148, 163, 184, 0.5)',
          }}
        >
          баллов
        </span>
      </div>
    </div>
  );
}
