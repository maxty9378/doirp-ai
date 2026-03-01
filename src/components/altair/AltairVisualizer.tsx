'use client';

import { type RefObject, useEffect, useRef } from 'react';

const DEFAULT_ACCENT = '129, 102, 241'; // rgb for rgba(129, 102, 241, alpha)
const NUM_POINTS = 64;
const SMOOTHING = 0.35;
const RADIUS_BASE = 0.35;
const RADIUS_AMP = 0.2;

export interface AltairVisualizerProps {
  analyserRef: RefObject<AnalyserNode | null>;
  width: number;
  height: number;
  accent?: string;
  active?: boolean;
  className?: string;
}

/**
 * Canvas-визуализатор в стиле Google Altair: органичная «аура» по freqData.
 * Принимает ref на AnalyserNode, рисует волну/частицы по частотам.
 */
export function AltairVisualizer({
  analyserRef,
  width,
  height,
  accent = DEFAULT_ACCENT,
  active = true,
  className,
}: AltairVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const prevRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!active || width <= 0 || height <= 0) return;

    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fftSize = analyser.frequencyBinCount;
    if (!freqDataRef.current || freqDataRef.current.length !== fftSize) {
      freqDataRef.current = new Uint8Array(fftSize);
      prevRef.current = new Float32Array(NUM_POINTS);
    }
    const freqData = freqDataRef.current;
    const prev = prevRef.current!;

    let rafId = 0;

    const draw = () => {
      rafId = requestAnimationFrame(draw);

      const a = analyserRef.current;
      if (!a || !freqDataRef.current) return;

      a.getByteFrequencyData(freqData);

      const w = width;
      const h = height;
      const cx = w / 2;
      const cy = h / 2;
      const step = Math.floor(freqData.length / NUM_POINTS);

      ctx.clearRect(0, 0, w, h);

      const maxRadius = Math.min(w, h) * 0.45;
      const points: { x: number; y: number; r: number }[] = [];

      for (let i = 0; i < NUM_POINTS; i++) {
        let sum = 0;
        for (let k = 0; k < step; k++) sum += freqData[i * step + k] ?? 0;
        const raw = sum / step / 255;
        const smooth = prev[i] + (raw - prev[i]) * SMOOTHING;
        prev[i] = smooth;

        const angle = (i / NUM_POINTS) * Math.PI * 2 - Math.PI / 2;
        const rNorm = RADIUS_BASE + RADIUS_AMP * smooth;
        const r = maxRadius * rNorm;
        points.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          r: 1.5 + smooth * 3,
        });
      }

      // Заливка под кривой (градиент «аура»)
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        const p = points[i]!;
        const prevP = points[i - 1]!;
        const cpx = (prevP.x + p.x) / 2;
        const cpy = (prevP.y + p.y) / 2;
        ctx.quadraticCurveTo(cpx, cpy, p.x, p.y);
      }
      ctx.closePath();

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 1.2);
      gradient.addColorStop(0, `rgba(${accent}, 0.25)`);
      gradient.addColorStop(0.5, `rgba(${accent}, 0.08)`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fill();

      // Контур и точки (частицы)
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        const p = points[i]!;
        const prevP = points[i - 1]!;
        const cpx = (prevP.x + p.x) / 2;
        const cpy = (prevP.y + p.y) / 2;
        ctx.quadraticCurveTo(cpx, cpy, p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${accent}, 0.5)`;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        const alpha = 0.4 + (prev[i] ?? 0) * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent}, ${alpha})`;
        ctx.fill();
      }
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, [active, width, height, accent, analyserRef]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    />
  );
}
