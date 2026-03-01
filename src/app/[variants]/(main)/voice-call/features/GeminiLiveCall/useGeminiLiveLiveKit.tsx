'use client';

import { useVoiceAssistant } from '@livekit/components-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { TranscriptEntry } from './useGeminiLiveTypes';

const LIVEKIT_SERVER_URL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_LIVEKIT_URL
    ? process.env.NEXT_PUBLIC_LIVEKIT_URL
    : 'wss://doirp-kxzb758v.livekit.cloud';

const PATIENCE_INITIAL = 100;

export interface UseGeminiLiveLiveKitOptions {
  agentId?: string;
  onCallEnd?: (transcript: TranscriptEntry[]) => void;
  onError?: (message: string) => void;
  roomName?: string;
}

export interface LiveKitRoomContentProps {
  updateRef: React.MutableRefObject<{
    setLiveTranscript: React.Dispatch<React.SetStateAction<TranscriptEntry[]>>;
    setUserVolume: React.Dispatch<React.SetStateAction<number>>;
    setAiVolume: React.Dispatch<React.SetStateAction<number>>;
    setSubtitle: React.Dispatch<React.SetStateAction<string>>;
    setPatience: React.Dispatch<React.SetStateAction<number>>;
    setScore: React.Dispatch<React.SetStateAction<number>>;
    setHangUpByLpr: React.Dispatch<React.SetStateAction<boolean>>;
  }>;
}

/**
 * Renders inside LiveKitRoom. Syncs useVoiceAssistant state (transcriptions, volume) to parent hook state.
 */
function LiveKitRoomContent({ updateRef }: LiveKitRoomContentProps) {
  const { agentTranscriptions } = useVoiceAssistant();
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (!updateRef.current) return;
    const list = Array.isArray(agentTranscriptions) ? agentTranscriptions : [];
    const entries: TranscriptEntry[] = list
      .map((t: unknown) => ({ role: 'ai' as const, text: (t as { text?: string })?.text ?? '' }))
      .filter((e) => e.text.trim());
    if (entries.length >= prevLenRef.current) {
      const newSegments = entries.slice(prevLenRef.current);
      prevLenRef.current = entries.length;
      if (newSegments.length > 0) {
        updateRef.current.setLiveTranscript((prev) => [...prev, ...newSegments]);
      }
    } else {
      prevLenRef.current = entries.length;
    }
  }, [agentTranscriptions, updateRef]);

  return null;
}

export function useGeminiLiveLiveKit({
  agentId = 'voice-simulator-lpr',
  onCallEnd,
  onError,
  roomName = 'voice-training',
}: UseGeminiLiveLiveKitOptions) {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl] = useState(LIVEKIT_SERVER_URL);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [score, setScore] = useState(0);
  const [subtitle, setSubtitle] = useState('');
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
  const [patience, setPatience] = useState(PATIENCE_INITIAL);
  const [hangUpByLpr, setHangUpByLpr] = useState(false);

  const updateRef = useRef({
    setLiveTranscript,
    setUserVolume,
    setAiVolume,
    setSubtitle,
    setPatience,
    setScore,
    setHangUpByLpr,
  });
  updateRef.current.setLiveTranscript = setLiveTranscript;
  updateRef.current.setUserVolume = setUserVolume;
  updateRef.current.setAiVolume = setAiVolume;
  updateRef.current.setSubtitle = setSubtitle;
  updateRef.current.setPatience = setPatience;
  updateRef.current.setScore = setScore;
  updateRef.current.setHangUpByLpr = setHangUpByLpr;

  const connect = useCallback(async () => {
    setStatus('connecting');
    setErrorMessage(null);
    setLiveTranscript([]);
    setScore(0);
    setSubtitle('');
    setPatience(PATIENCE_INITIAL);
    setHangUpByLpr(false);
    try {
      const res = await fetch(
        `/api/livekit?room=${encodeURIComponent(roomName)}&agentId=${encodeURIComponent(agentId ?? '')}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setToken(data.token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось подключиться';
      setErrorMessage(msg);
      setStatus('error');
      onError?.(msg);
    }
  }, [agentId, roomName, onError]);

  const disconnect = useCallback(() => {
    const transcript = [...liveTranscript];
    if (transcript.length > 0 && onCallEnd) onCallEnd(transcript);
    setToken(null);
    setLiveTranscript([]);
    setStatus('idle');
    setErrorMessage(null);
    setUserVolume(0);
    setAiVolume(0);
    setScore(0);
    setSubtitle('');
    setPatience(PATIENCE_INITIAL);
    setHangUpByLpr(false);
  }, [liveTranscript, onCallEnd]);

  const onRoomConnected = useCallback(() => {
    setStatus('ready');
  }, []);

  const onRoomDisconnected = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const getTranscript = useCallback(() => [...liveTranscript], [liveTranscript]);

  return {
    connect,
    disconnect,
    errorMessage,
    hangUpByLpr,
    status,
    userVolume,
    aiVolume,
    score,
    subtitle,
    patience,
    getTranscript,
    liveTranscript,
    token,
    serverUrl,
    onRoomConnected,
    onRoomDisconnected,
    LiveKitRoomContent,
    updateRef,
  };
}

export { LIVEKIT_SERVER_URL };
