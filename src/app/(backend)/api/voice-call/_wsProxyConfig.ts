const AUTH_PROTECTED_PROXY_HOST = 'doirp-ai.vercel.app';
const AUTH_PROTECTED_PROXY_PATH = '/voice-call-ws';

/**
 * Browser-facing WebSocket proxy endpoint.
 * The proxy service behind this URL is responsible for loading upstream HTTP/SOCKS proxies
 * from `voice_call_proxies` in the database.
 */
export const PUBLIC_VOICE_PROXY_WS = 'wss://ponkacat.ru/voice-call-ws';

export const normalizeProxyBaseUrl = (url: string | null | undefined) => {
  if (!url?.trim()) return null;

  try {
    const parsed = new URL(url.trim());
    parsed.protocol = parsed.protocol === 'ws:' ? 'http:' : 'https:';
    parsed.search = '';
    parsed.hash = '';

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

export const normalizeVoiceProxyUrl = (url: string | null | undefined) => {
  if (!url?.trim()) return null;

  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, '');
    const isAuthProtectedProxy =
      parsed.hostname === AUTH_PROTECTED_PROXY_HOST && path === AUTH_PROTECTED_PROXY_PATH;

    if (isAuthProtectedProxy) {
      return PUBLIC_VOICE_PROXY_WS;
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
};

interface ResolveVoiceCallWsProxyUrlOptions {
  devProxyUrl?: string | null;
  explicitProxyUrl?: string | null;
  nodeEnv?: string;
}

export const resolveVoiceCallWsProxyUrl = ({
  devProxyUrl,
  explicitProxyUrl,
  nodeEnv = process.env.NODE_ENV,
}: ResolveVoiceCallWsProxyUrlOptions = {}) => {
  const normalizedExplicit = normalizeVoiceProxyUrl(explicitProxyUrl);
  if (normalizedExplicit) return normalizedExplicit;

  if (nodeEnv === 'development') {
    // In local dev, respect VOICE_CALL_WS_PROXY_DEV when set; otherwise use the public proxy.
    return normalizeVoiceProxyUrl(devProxyUrl) || PUBLIC_VOICE_PROXY_WS;
  }

  return PUBLIC_VOICE_PROXY_WS;
};
