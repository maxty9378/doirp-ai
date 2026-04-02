const AUTH_PROTECTED_PROXY_HOST = 'doirp-ai.vercel.app';
const AUTH_PROTECTED_PROXY_PATH = '/voice-call-ws';
export const APP_VOICE_PROXY_PATH = '/gemini-live-ws';

/**
 * Direct public WebSocket proxy endpoint on the VPS.
 * In production, browsers should prefer the same-origin Vercel tunnel path instead.
 */
export const PUBLIC_VOICE_PROXY_WS = 'wss://apidoirp.ru/voice-call-ws';

export const buildAppVoiceProxyWsUrl = (appUrl: string | null | undefined) => {
  if (!appUrl?.trim()) return null;

  try {
    const parsed = new URL(appUrl.trim());
    parsed.protocol = parsed.protocol === 'http:' ? 'ws:' : 'wss:';
    parsed.pathname = APP_VOICE_PROXY_PATH;
    parsed.search = '';
    parsed.hash = '';

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

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
      parsed.pathname = APP_VOICE_PROXY_PATH;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
};

interface ResolveVoiceCallWsProxyUrlOptions {
  appUrl?: string | null;
  devProxyUrl?: string | null;
  explicitProxyUrl?: string | null;
  nodeEnv?: string;
  useAppTunnelInProduction?: boolean;
}

export const resolveVoiceCallWsProxyUrl = ({
  appUrl,
  devProxyUrl,
  explicitProxyUrl,
  nodeEnv = process.env.NODE_ENV,
  useAppTunnelInProduction = false,
}: ResolveVoiceCallWsProxyUrlOptions = {}) => {
  const normalizedExplicit = normalizeVoiceProxyUrl(explicitProxyUrl);
  if (normalizedExplicit) return normalizedExplicit;

  if (nodeEnv === 'development') {
    // In local dev, respect VOICE_CALL_WS_PROXY_DEV when set; otherwise use the public proxy.
    return normalizeVoiceProxyUrl(devProxyUrl) || PUBLIC_VOICE_PROXY_WS;
  }

  if (useAppTunnelInProduction) {
    return buildAppVoiceProxyWsUrl(appUrl) || PUBLIC_VOICE_PROXY_WS;
  }

  return PUBLIC_VOICE_PROXY_WS;
};
