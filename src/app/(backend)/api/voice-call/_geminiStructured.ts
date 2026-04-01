import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

import { proxyFetch } from './_proxyFetch';

const DEFAULT_GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

type GeminiSchemaPrimitiveType = 'BOOLEAN' | 'INTEGER' | 'NUMBER' | 'STRING';
type GeminiSchemaContainerType = 'ARRAY' | 'OBJECT';

export interface GeminiStructuredSchema {
  description?: string;
  enum?: string[];
  items?: GeminiStructuredSchema;
  properties?: Record<string, GeminiStructuredSchema>;
  required?: string[];
  type: GeminiSchemaContainerType | GeminiSchemaPrimitiveType;
}

interface GeminiStructuredResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface GenerateGeminiStructuredJsonOptions {
  emptyResponseMessage: string;
  maxOutputTokens?: number;
  model: string;
  promptText: string;
  responseSchema: GeminiStructuredSchema;
  temperature?: number;
}

export const generateGeminiStructuredJson = async <T>({
  emptyResponseMessage,
  maxOutputTokens = 2048,
  model,
  promptText,
  responseSchema,
  temperature = 0.1,
}: GenerateGeminiStructuredJsonOptions): Promise<T> => {
  const { GOOGLE_API_KEY, GOOGLE_API_BASE } = getLLMConfig();
  const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }

  const baseUrl = GOOGLE_API_BASE?.trim() || DEFAULT_GOOGLE_API_BASE;
  const endpoint = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await proxyFetch(endpoint, {
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }], role: 'user' }],
      generationConfig: {
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema,
        temperature,
      },
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  const responseData = (await response.json().catch(() => ({}))) as GeminiStructuredResponse;

  if (!response.ok) {
    throw new Error(responseData.error?.message || 'Gemini structured request failed');
  }

  const raw = (responseData.candidates?.[0]?.content?.parts?.map((part) => part.text || '') ?? [])
    .join('')
    .trim();
  if (!raw) {
    throw new Error(emptyResponseMessage);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Gemini structured response is not valid JSON');
  }
};
