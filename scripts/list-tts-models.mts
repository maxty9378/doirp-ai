import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const getProxyAgent = () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (!proxyUrl) return undefined;
  
  if (proxyUrl.startsWith('socks')) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
};

const loadEnv = () => {
  dotenvExpand.expand(dotenv.config());
  dotenvExpand.expand(dotenv.config({ override: true, path: '.env.local' }));
  dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV || 'development'}` }));
  dotenvExpand.expand(
    dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV || 'development'}.local` }),
  );
};

const main = async () => {
  loadEnv();

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');

  const GOOGLE_API_BASE = process.env.GOOGLE_PROXY_URL || process.env.GOOGLE_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
  const endpoint = `${GOOGLE_API_BASE}/models?key=${encodeURIComponent(apiKey)}`;
  
  const fetchOptions = {
    agent: getProxyAgent(),
    headers: { 'Content-Type': 'application/json' },
    method: 'GET',
  };

  console.log(`Fetching models from ${GOOGLE_API_BASE}...`);
  
  const response = await fetch(endpoint, fetchOptions as any);
  const result = (await response.json()) as any;

  if (!response.ok) {
    throw new Error(result?.error?.message || `Failed (${response.status})`);
  }

  const models = result.models || [];
  
  console.log(`\nFound ${models.length} total models. Filtering for TTS/Audio...\n`);

  const audioModels = models.filter((model: any) => {
    const name = (model.name || '').toLowerCase();
    const displayName = (model.displayName || '').toLowerCase();
    const description = (model.description || '').toLowerCase();
    
    return name.includes('tts') || displayName.includes('tts') || description.includes('tts') ||
           name.includes('audio') || displayName.includes('audio') || description.includes('audio');
  });

  if (audioModels.length === 0) {
    console.log('No TTS or audio models found.');
  } else {
    audioModels.forEach((model: any) => {
      console.log(`Name: ${model.name}`);
      console.log(`Display Name: ${model.displayName}`);
      console.log(`Description: ${model.description}`);
      console.log(`Version: ${model.version}`);
      console.log(`Supported Generation Methods: ${model.supportedGenerationMethods?.join(', ')}`);
      console.log('-----------------------------------');
    });
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});