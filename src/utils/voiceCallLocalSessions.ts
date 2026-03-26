import type { VoiceCallSttStatus, VoiceCallTranscriptSource } from '@lobechat/database/schemas';

import { type VoiceCallDebugSnapshot } from './voiceCallDebug';

export interface LocalVoiceCallSession {
  analysisResult: any | null;
  createdAt: string;
  debugLog?: VoiceCallDebugSnapshot | null;
  durationSeconds?: number;
  hangUpReason?: string;
  id: string;
  localOnly: true;
  saveError?: string;
  scenarioId: string;
  score: number | null;
  speakerName?: string;
  sttError?: string;
  sttStatus?: VoiceCallSttStatus;
  transcript: Array<{ role: 'ai' | 'user'; text: string }>;
  transcriptSource?: VoiceCallTranscriptSource;
}

const STORAGE_KEY = 'voiceCallLocalSessions:v1';
const MAX_LOCAL_SESSIONS = 50;
export const LOCAL_SESSION_PREFIX = 'local-';

const isBrowser = () => typeof window !== 'undefined';

const safeParse = (raw: string | null): LocalVoiceCallSession[] => {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const writeAll = (sessions: LocalVoiceCallSession[]) => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore storage failures
  }
};

export const loadLocalVoiceCallSessions = (): LocalVoiceCallSession[] => {
  if (!isBrowser()) return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
};

export const getLocalVoiceCallSession = (id: string): LocalVoiceCallSession | null => {
  const sessions = loadLocalVoiceCallSessions();
  return sessions.find((s) => s.id === id) ?? null;
};

export const saveLocalVoiceCallSession = (session: LocalVoiceCallSession) => {
  const sessions = loadLocalVoiceCallSessions();
  const next = [session, ...sessions.filter((s) => s.id !== session.id)].slice(
    0,
    MAX_LOCAL_SESSIONS,
  );
  writeAll(next);
};

export const removeLocalVoiceCallSession = (id: string) => {
  const sessions = loadLocalVoiceCallSessions();
  const next = sessions.filter((s) => s.id !== id);
  writeAll(next);
};
