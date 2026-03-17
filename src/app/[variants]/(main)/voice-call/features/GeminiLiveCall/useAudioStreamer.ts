'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;
const VOLUME_SMOOTH = 0.25;
const VOLUME_DECAY = 0.85;
const AI_VOLUME_SCALE = 0.15;

export interface UseAudioStreamerOptions {
  workletUrl: string;
  onMicData?: (pcmBuffer: ArrayBuffer) => void;
}

export interface AudioStreamerState {
  userVolume: number;
  aiVolume: number;
  isActive: boolean;
  error: string | null;
}

export interface AudioStreamerApi {
  startAudio: () => Promise<void>;
  stopAudio: () => void;
  attachOutputNode: (node: AudioNode | null) => void;
  outputContext: AudioContext | null;
  inputStream: MediaStream | null;
}

export function useAudioStreamer(
  options: UseAudioStreamerOptions,
): AudioStreamerState & AudioStreamerApi {
  const { workletUrl, onMicData } = options;

  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputStream, setInputStream] = useState<MediaStream | null>(null);
  const [outputContext, setOutputContext] = useState<AudioContext | null>(null);

  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const aiFreqDataRef = useRef<Uint8Array | null>(null);

  const userVolumeCurrentRef = useRef(0);
  const aiVolumeCurrentRef = useRef(0);

  const outputNodeRef = useRef<AudioNode | null>(null);
  const rafIdRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }

    try {
      inputStream?.getTracks().forEach((t) => t.stop());
    } catch {}

    setInputStream(null);

    try {
      workletNodeRef.current?.disconnect();
    } catch {}
    workletNodeRef.current = null;

    try {
      inputSourceRef.current?.disconnect();
    } catch {}
    inputSourceRef.current = null;

    try {
      outputNodeRef.current?.disconnect();
    } catch {}
    outputNodeRef.current = null;

    try {
      aiAnalyserRef.current?.disconnect();
    } catch {}
    aiAnalyserRef.current = null;
    aiFreqDataRef.current = null;

    if (inputContextRef.current) {
      inputContextRef.current.close().catch(() => {});
      inputContextRef.current = null;
    }

    if (outputContextRef.current) {
      outputContextRef.current.close().catch(() => {});
      outputContextRef.current = null;
      setOutputContext(null);
    }

    setIsActive(false);
  }, [inputStream]);

  const startAudio = useCallback(async () => {
    if (isActive) return;

    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setInputStream(stream);

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;

      const inputCtx = new AudioCtx({ sampleRate: INPUT_SAMPLE_RATE });
      const outputCtx = new AudioCtx({ sampleRate: OUTPUT_SAMPLE_RATE });

      inputContextRef.current = inputCtx;
      outputContextRef.current = outputCtx;
      setOutputContext(outputCtx);

      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      let workletNode: AudioWorkletNode | null = null;
      if (inputCtx.audioWorklet && workletUrl) {
        await inputCtx.audioWorklet.addModule(workletUrl);
        workletNode = new AudioWorkletNode(inputCtx, 'audio-processor');
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event: MessageEvent) => {
          const data = event.data as
            | { type: 'audio'; buffer: ArrayBuffer; volume: number }
            | { type: string };

          if (!data || typeof data !== 'object') return;
          if ((data as any).type !== 'audio') return;

          const { buffer, volume } = data as { buffer: ArrayBuffer; volume: number };

          if (buffer && onMicData) {
            onMicData(buffer);
          }

          const clampedVol = Math.max(0, Math.min(1, Number(volume) || 0));
          const target = clampedVol * 100;
          const cur = userVolumeCurrentRef.current;
          userVolumeCurrentRef.current = cur + (target - cur) * VOLUME_SMOOTH;
          setUserVolume(Math.round(userVolumeCurrentRef.current));
        };
      }

      const inputSource = inputCtx.createMediaStreamSource(stream);
      inputSourceRef.current = inputSource;

      if (workletNode) {
        inputSource.connect(workletNode);
      } else {
        inputSource.connect(inputCtx.destination);
      }

      const aiAnalyser = outputCtx.createAnalyser();
      aiAnalyser.fftSize = 1024;
      aiAnalyserRef.current = aiAnalyser;
      aiFreqDataRef.current = new Uint8Array(aiAnalyser.frequencyBinCount);

      const tick = () => {
        const aiAnalyserNode = aiAnalyserRef.current;
        const aiFreqData = aiFreqDataRef.current;

        if (aiAnalyserNode && aiFreqData) {
          aiAnalyserNode.getByteFrequencyData(aiFreqData as any);
          let sum = 0;
          for (let i = 0; i < aiFreqData.length; i++) sum += aiFreqData[i];
          const avg = sum / aiFreqData.length;
          const target = Math.min(100, avg * AI_VOLUME_SCALE);
          const cur = aiVolumeCurrentRef.current;
          aiVolumeCurrentRef.current = cur + (target - cur) * VOLUME_SMOOTH;
          setAiVolume(Math.round(aiVolumeCurrentRef.current));
        } else {
          aiVolumeCurrentRef.current *= VOLUME_DECAY;
          setAiVolume(Math.round(aiVolumeCurrentRef.current));
        }

        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);
      setIsActive(true);
    } catch (e) {
      console.error('[useAudioStreamer] failed to start audio:', e);
      setError(e instanceof Error ? e.message : 'Не удалось инициализировать аудио');
      cleanup();
    }
  }, [cleanup, isActive, workletUrl, onMicData]);

  const stopAudio = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const attachOutputNode = useCallback((node: AudioNode | null) => {
    const outputCtx = outputContextRef.current;
    const aiAnalyser = aiAnalyserRef.current;

    try {
      if (outputNodeRef.current) {
        outputNodeRef.current.disconnect();
        outputNodeRef.current = null;
      }
    } catch {}

    if (!node || !outputCtx || !aiAnalyser) {
      outputNodeRef.current = null;
      return;
    }

    node.connect(aiAnalyser);
    aiAnalyser.connect(outputCtx.destination);
    outputNodeRef.current = node;
  }, []);

  useEffect(
    () => () => {
      stopAudio();
    },
    [stopAudio],
  );

  return {
    userVolume,
    aiVolume,
    isActive,
    error,
    startAudio,
    stopAudio,
    attachOutputNode,
    outputContext,
    inputStream,
  };
}

