const AUTH_PROTECTED_PROXY_HOST = 'doirp-ai.vercel.app';
const AUTH_PROTECTED_PROXY_PATH = '/voice-call-ws';
const DEPRECATED_VOICE_PROXY_HOSTS = new Set(['apidoirp.ru']);
export const APP_VOICE_PROXY_PATH = '/gemini-live-ws';

/**
 * Public same-origin WebSocket proxy endpoint. Vercel rewrites this path to the VPS.
 */
export const PUBLIC_VOICE_PROXY_WS = `wss://${AUTH_PROTECTED_PROXY_HOST}${APP_VOICE_PROXY_PATH}`;

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

export const resolveVoiceCallWsProxyUrl = ({
  appUrl,
  devProxyUrl,
  explicitProxyUrl,
  nodeEnv = process.env.NODE_ENV,
  useAppTunnelInProduction = true,
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
