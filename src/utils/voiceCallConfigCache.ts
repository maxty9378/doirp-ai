'use client';

export interface VoiceCallConfigPreviewPayload {
  goals?: string[];
  legend?: string | null;
  showLegend?: boolean;
  title?: string | null;
}

const VOICE_CALL_CONFIG_CACHE_PREFIX = 'voice-call-config:';

const canUseSessionStorage = () => typeof window !== 'undefined';

const getVoiceCallConfigCacheKey = (agentId: string) =>
  `${VOICE_CALL_CONFIG_CACHE_PREFIX}${agentId.trim()}`;

export const getCachedVoiceCallConfig = (agentId: string): VoiceCallConfigPreviewPayload | null => {
  if (!canUseSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(getVoiceCallConfigCacheKey(agentId));
    if (!raw) return null;

    return JSON.parse(raw) as VoiceCallConfigPreviewPayload;
  } catch {
    return null;
  }
};

export const setCachedVoiceCallConfig = (
  agentId: string,
  payload: VoiceCallConfigPreviewPayload,
) => {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.setItem(getVoiceCallConfigCacheKey(agentId), JSON.stringify(payload));
  } catch {
    // ignore cache failures
  }
};

export const prefetchVoiceCallConfig = async (agentId: string) => {
  const trimmedAgentId = agentId.trim();
  if (!trimmedAgentId) return null;

  const cached = getCachedVoiceCallConfig(trimmedAgentId);
  if (cached) return cached;

  try {
    const response = await fetch(`/api/voice-call/config?agentId=${encodeURIComponent(trimmedAgentId)}`, {
      credentials: 'include',
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as VoiceCallConfigPreviewPayload;
    setCachedVoiceCallConfig(trimmedAgentId, payload);

    return payload;
  } catch {
    return null;
  }
};
