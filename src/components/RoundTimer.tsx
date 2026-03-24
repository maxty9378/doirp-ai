'use client';

import React, { useEffect, useState } from 'react';

export interface RoundTimerProps {
  isCallActive: boolean;
  callStartAt: number | null;
  hardHangupMs: number | null;
}

const formatSeconds = (total: number) => {
  const clamped = Math.max(0, total);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const RoundTimer: React.FC<RoundTimerProps> = ({
  isCallActive,
  callStartAt,
  hardHangupMs,
}) => {
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!isCallActive || !callStartAt) return;
    const id = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [isCallActive, callStartAt]);

  if (!isCallActive || !callStartAt || !hardHangupMs) return null;

  const remainingSeconds = Math.max(
    0,
    Math.round((hardHangupMs - (nowTs - callStartAt)) / 1000),
  );
  const isLow = remainingSeconds <= 30;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.1em',
          color: isLow ? '#ef4444' : 'rgba(148, 163, 184, 0.8)',
        }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={12} cy={12} r={10} />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Осталось
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '0.12em',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontVariantNumeric: 'tabular-nums',
          color: isLow ? '#ef4444' : '#f1f5f9',
          textShadow: isLow ? '0 0 12px rgba(239,68,68,0.4)' : 'none',
          transition: 'color 0.3s ease',
        }}
      >
        {formatSeconds(remainingSeconds)}
      </div>
    </div>
  );
};
