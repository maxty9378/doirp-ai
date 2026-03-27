import './audio-pulse.scss';

import { useEffect, useRef } from 'react';

import { cx } from '../../lib/cx';

const lineCount = 3;

export type AudioPulseProps = {
  active: boolean;
  volume: number;
  hover?: boolean;
};

export default function AudioPulse({ active, hover, volume }: AudioPulseProps) {
  const lines = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    let timeout: number | null = null;

    const update = () => {
      lines.current.forEach((line, index) => {
        if (!line) return;
        line.style.height = `${Math.min(24, 4 + volume * (index === 1 ? 400 : 60))}px`;
      });
      timeout = window.setTimeout(update, 100);
    };

    update();

    return () => clearTimeout(timeout || 0);
  }, [volume]);

  return (
    <div className={cx('audioPulse', { active, hover: Boolean(hover) })}>
      {Array(lineCount)
        .fill(null)
        .map((_, index) => (
          <div
            key={index}
            ref={(element) => {
              if (element) lines.current[index] = element;
            }}
            style={{ animationDelay: `${index * 133}ms` }}
          />
        ))}
    </div>
  );
}
