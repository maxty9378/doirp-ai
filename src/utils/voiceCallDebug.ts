export interface VoiceCallDebugEvent {
  at: string;
  data?: Record<string, unknown>;
  type: string;
}

export interface VoiceCallDebugSnapshot {
  agentId: string;
  events: VoiceCallDebugEvent[];
  status: string;
}

const VOICE_CALL_DEBUG_STORAGE_KEY = 'voice-call-debug:last';

declare global {
  interface Window {
    __voiceCallDebug?: VoiceCallDebugSnapshot;
    __voiceCallDebugHistory?: VoiceCallDebugSnapshot;
  }
}

export const persistVoiceCallDebugSnapshot = (snapshot: VoiceCallDebugSnapshot) => {
  if (typeof window === 'undefined') return;

  window.__voiceCallDebug = snapshot;
  window.__voiceCallDebugHistory = snapshot;

  try {
    window.sessionStorage.setItem(VOICE_CALL_DEBUG_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore sessionStorage failures in private mode / quota issues
  }
};

export const getPersistedVoiceCallDebugSnapshot = (): VoiceCallDebugSnapshot | null => {
  if (typeof window === 'undefined') return null;

  if (window.__voiceCallDebugHistory) return window.__voiceCallDebugHistory;

  try {
    const raw = window.sessionStorage.getItem(VOICE_CALL_DEBUG_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as VoiceCallDebugSnapshot;
    window.__voiceCallDebugHistory = parsed;

    return parsed;
  } catch {
    return null;
  }
};

export const getVoiceCallDebugSnapshot = (): VoiceCallDebugSnapshot | null => {
  if (typeof window === 'undefined') return null;

  return window.__voiceCallDebug ?? getPersistedVoiceCallDebugSnapshot();
};
