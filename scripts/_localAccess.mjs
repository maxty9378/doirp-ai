import { readFile } from 'node:fs/promises';
import path from 'node:path';

const LOCAL_SERVER_ACCESS_PATH = path.join(process.cwd(), '.local', 'server-access.json');

let cachedLocalAccessConfig = null;

function parseListEnv(value) {
  if (!value) return [];

  return value
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadLocalAccessConfig() {
  if (cachedLocalAccessConfig) return cachedLocalAccessConfig;

  try {
    const raw = await readFile(LOCAL_SERVER_ACCESS_PATH, 'utf8');
    cachedLocalAccessConfig = JSON.parse(raw);
    return cachedLocalAccessConfig;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      cachedLocalAccessConfig = {};
      return cachedLocalAccessConfig;
    }

    throw new Error(`[server-access] Failed to read ${LOCAL_SERVER_ACCESS_PATH}: ${error.message}`);
  }
}

function requireString(value, envName, label) {
  const normalized = value?.trim();
  if (normalized) return normalized;

  throw new Error(
    `[server-access] Missing ${label}. Set ${envName} or add it to ${LOCAL_SERVER_ACCESS_PATH}.`,
  );
}

function parsePort(value, envName, label, fallback = 22) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  if (fallback > 0) return fallback;

  throw new Error(
    `[server-access] Missing ${label}. Set ${envName} or add it to ${LOCAL_SERVER_ACCESS_PATH}.`,
  );
}

async function resolveSshConfig(serverKey, envPrefix) {
  const config = await loadLocalAccessConfig();
  const serverConfig = config.servers?.[serverKey];

  const host = requireString(
    process.env[`${envPrefix}_HOST`] || serverConfig?.host,
    `${envPrefix}_HOST`,
    `${serverKey} host`,
  );
  const username = requireString(
    process.env[`${envPrefix}_USER`] || serverConfig?.username,
    `${envPrefix}_USER`,
    `${serverKey} username`,
  );
  const password = requireString(
    process.env[`${envPrefix}_PASSWORD`] || serverConfig?.password,
    `${envPrefix}_PASSWORD`,
    `${serverKey} password`,
  );
  const port = parsePort(
    process.env[`${envPrefix}_PORT`] || serverConfig?.port,
    `${envPrefix}_PORT`,
    `${serverKey} port`,
  );

  return {
    host,
    password,
    port,
    username,
  };
}

export function proxyEntryToSocksUrl(entry) {
  const normalized = entry.trim();
  if (!normalized) return '';

  if (
    normalized.startsWith('socks5h://') ||
    normalized.startsWith('socks5://') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  ) {
    return normalized.replace(/^https?:\/\//, 'socks5h://').replace(/^socks5:\/\//, 'socks5h://');
  }

  const parts = normalized.split(':');
  if (parts.length < 4) return '';

  const [host, port, user, ...passwordParts] = parts;
  const password = passwordParts.join(':');

  if (!host || !port || !user || !password) return '';

  return `socks5h://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
}

export async function resolveVoiceGatewaySshConfig() {
  return resolveSshConfig('voiceGateway', 'VOICE_GATEWAY_SSH');
}

export async function resolveVpnNodeSshConfig() {
  return resolveSshConfig('vpnNode', 'VPN_NODE_SSH');
}

export async function resolveVoiceCallFallbackProxyEntries() {
  const envEntries = parseListEnv(process.env.VOICE_CALL_PROXY_FALLBACK_LIST);
  if (envEntries.length) return envEntries;

  const config = await loadLocalAccessConfig();
  return config.proxies?.voiceCallFallbackEntries?.map((item) => item.trim()).filter(Boolean) || [];
}

export async function resolveVoiceCallTestProxyUrls() {
  const envUrls = parseListEnv(process.env.VOICE_CALL_PROXY_TEST_URLS)
    .map(proxyEntryToSocksUrl)
    .filter(Boolean);
  if (envUrls.length) return envUrls;

  const entries = await resolveVoiceCallFallbackProxyEntries();
  return entries.map(proxyEntryToSocksUrl).filter(Boolean);
}
