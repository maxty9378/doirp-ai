const AUTH_PROTECTED_PROXY_HOST = 'doirp-ai.vercel.app';
const AUTH_PROTECTED_PROXY_PATH = '/voice-call-ws';
const DEPRECATED_VOICE_PROXY_HOSTS = new Set(['apidoirp.ru']);
export const APP_VOICE_PROXY_PATH = '/gemini-live-ws';

/**
 * Direct public WebSocket proxy endpoint on the VPS.
 * In production, browsers should prefer the same-origin Vercel tunnel path instead.
 */
export const PUBLIC_VOICE_PROXY_WS = 'wss://ponkacat.ru/voice-call-ws';

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
    const isDeprecatedProxy =
      DEPRECATED_VOICE_PROXY_HOSTS.has(parsed.hostname) && path === AUTH_PROTECTED_PROXY_PATH;
    const isAuthProtectedProxy =
      parsed.hostname === AUTH_PROTECTED_PROXY_HOST && path === AUTH_PROTECTED_PROXY_PATH;

    if (isDeprecatedProxy) return PUBLIC_VOICE_PROXY_WS;

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

export const resolveVoiceCallWsProxyUrl = (options: ResolveVoiceCallWsProxyUrlOptions = {}) => {
  const normalizedExplicit = normalizeVoiceProxyUrl(options.explicitProxyUrl);
  if (normalizedExplicit) return normalizedExplicit;

  return PUBLIC_VOICE_PROXY_WS;
};
