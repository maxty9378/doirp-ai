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

declare global {
  interface Window {
    __voiceCallDebug?: VoiceCallDebugSnapshot;
  }
}

export const getVoiceCallDebugSnapshot = (): VoiceCallDebugSnapshot | null => {
  if (typeof window === 'undefined') return null;
  return window.__voiceCallDebug ?? null;
};

