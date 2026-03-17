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

  return (
    <div style={{ textAlign: 'center' }}>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--colorTextSecondary)',
        }}
      >
        Осталось времени
      </span>
      <div
        style={{
          marginTop: 4,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: 'var(--colorText)',
        }}
      >
        {formatSeconds(remainingSeconds)}
      </div>
    </div>
  );
};

