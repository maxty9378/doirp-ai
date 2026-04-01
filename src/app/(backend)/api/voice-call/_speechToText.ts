import { randomUUID } from 'node:crypto';

import { safeParseJSON } from '@lobechat/utils';
import { importPKCS8, SignJWT } from 'jose';

import { getLLMConfig } from '@/envs/llm';

import { proxyFetch } from './_proxyFetch';

const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_STORAGE_UPLOAD_ENDPOINT = 'https://storage.googleapis.com/upload/storage/v1';
const GOOGLE_STORAGE_ENDPOINT = 'https://storage.googleapis.com/storage/v1';
const GOOGLE_SPEECH_ENDPOINT = 'https://speech.googleapis.com/v2';
const GOOGLE_CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_LANGUAGE_CODE = 'ru-RU';
const DEFAULT_SPEECH_LOCATION = 'global';
const DEFAULT_SPEECH_MODEL = 'chirp_3';
const LONG_RUNNING_POLL_INTERVAL_MS = 2000;
const LONG_RUNNING_TIMEOUT_MS = 180000;
const ACCESS_TOKEN_SKEW_MS = 60_000;

interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

interface GoogleAccessTokenCache {
  accessToken: string;
  expiresAt: number;
}

interface SpeechRecognitionResult {
  alternatives?: Array<{
    confidence?: number;
    transcript?: string;
  }>;
  resultEndOffset?: string;
}

interface BatchRecognizeFileResult {
  error?: {
    code?: number;
    message?: string;
  };
  inlineResult?: {
    transcript?: {
      results?: SpeechRecognitionResult[];
    };
  };
  transcript?: {
    results?: SpeechRecognitionResult[];
  };
}

interface BatchRecognizeResponse {
  results?: Record<string, BatchRecognizeFileResult>;
}

interface BatchRecognizeOperation {
  done?: boolean;
  error?: {
    code?: number;
    message?: string;
  };
  name?: string;
  response?: BatchRecognizeResponse;
}

export interface PostCallSpeechSegment {
  confidence?: number;
  endTimeMs?: number;
  text: string;
}

export interface PostCallSpeechToTextResult {
  segments: PostCallSpeechSegment[];
  transcriptText: string;
}

let accessTokenCache: GoogleAccessTokenCache | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseDurationToMs = (value?: string) => {
  if (!value) return undefined;

  const normalized = value.trim();
  if (!normalized || !normalized.endsWith('s')) return undefined;

  const seconds = Number.parseFloat(normalized.slice(0, -1));
  if (!Number.isFinite(seconds)) return undefined;

  return Math.round(seconds * 1000);
};

const getGoogleSpeechSettings = () => {
  const {
    GOOGLE_SPEECH_BUCKET,
    GOOGLE_SPEECH_CREDENTIALS,
    GOOGLE_SPEECH_LOCATION,
    GOOGLE_SPEECH_MODEL,
    GOOGLE_SPEECH_PROJECT,
  } = getLLMConfig();

  const credentials = safeParseJSON<GoogleServiceAccountCredentials>(GOOGLE_SPEECH_CREDENTIALS);
  const project = GOOGLE_SPEECH_PROJECT?.trim() || credentials?.project_id?.trim() || '';
  const bucket = GOOGLE_SPEECH_BUCKET?.trim() || '';
  const location = GOOGLE_SPEECH_LOCATION?.trim() || DEFAULT_SPEECH_LOCATION;
  const model = GOOGLE_SPEECH_MODEL?.trim() || DEFAULT_SPEECH_MODEL;

  return {
    bucket,
    credentials,
    location,
    model,
    project,
  };
};

const getGoogleSpeechCredentials = () => {
  const { credentials } = getGoogleSpeechSettings();

  if (!credentials?.client_email || !credentials.private_key) {
    throw new Error(
      'Google Speech-to-Text не настроен: задайте GOOGLE_SPEECH_CREDENTIALS c service account JSON.',
    );
  }

  return {
    ...credentials,
    private_key: credentials.private_key.replaceAll('\\n', '\n'),
  };
};

const getGoogleSpeechProject = () => {
  const { project } = getGoogleSpeechSettings();

  if (!project) {
    throw new Error(
      'Google Speech-to-Text не настроен: не найден project_id в GOOGLE_SPEECH_CREDENTIALS или GOOGLE_SPEECH_PROJECT.',
    );
  }

  return project;
};

const getGoogleSpeechBucket = () => {
  const { bucket } = getGoogleSpeechSettings();

  if (!bucket) {
    throw new Error(
      'Google Speech-to-Text не настроен: задайте GOOGLE_SPEECH_BUCKET для временной загрузки аудио.',
    );
  }

  return bucket;
};

const createGoogleServiceAccountAssertion = async () => {
  const credentials = getGoogleSpeechCredentials();
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(credentials.private_key, 'RS256');

  return new SignJWT({ scope: GOOGLE_CLOUD_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(credentials.client_email)
    .setSubject(credentials.client_email)
    .setAudience(GOOGLE_OAUTH_TOKEN_ENDPOINT)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
};

const getGoogleCloudAccessToken = async () => {
  const now = Date.now();

  if (accessTokenCache && accessTokenCache.expiresAt - ACCESS_TOKEN_SKEW_MS > now) {
    return accessTokenCache.accessToken;
  }

  const assertion = await createGoogleServiceAccountAssertion();
  const body = new URLSearchParams({
    assertion,
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
  });

  const response = await proxyFetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
    expires_in?: number;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || 'Не удалось получить OAuth token для Google Speech.',
    );
  }

  accessTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + Math.max(60_000, (data.expires_in ?? 3600) * 1000),
  };

  return data.access_token;
};

const uploadTempAudioToGcs = async (buffer: Buffer, mimeType: string) => {
  const bucket = getGoogleSpeechBucket();
  const accessToken = await getGoogleCloudAccessToken();
  const objectName = `voice-call-stt/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.wav`;
  const uploadUrl = `${GOOGLE_STORAGE_UPLOAD_ENDPOINT}/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;

  const response = await proxyFetch(uploadUrl, {
    body: buffer,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': mimeType,
    },
    method: 'POST',
  });

  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(
      data.error?.message || 'Не удалось загрузить временный аудиофайл в Google Cloud Storage.',
    );
  }

  return {
    bucket,
    objectName,
    uri: `gs://${bucket}/${objectName}`,
  };
};

const deleteTempAudioFromGcs = async (bucket: string, objectName: string) => {
  try {
    const accessToken = await getGoogleCloudAccessToken();
    const deleteUrl = `${GOOGLE_STORAGE_ENDPOINT}/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`;

    await proxyFetch(deleteUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: 'DELETE',
    });
  } catch (error) {
    console.warn('[voice-call/stt] Failed to delete temporary GCS object:', error);
  }
};

const startBatchRecognize = async (gcsUri: string) => {
  const accessToken = await getGoogleCloudAccessToken();
  const { location, model } = getGoogleSpeechSettings();
  const project = getGoogleSpeechProject();
  const recognizer = `projects/${project}/locations/${location}/recognizers/_`;

  const response = await proxyFetch(`${GOOGLE_SPEECH_ENDPOINT}/${recognizer}:batchRecognize`, {
    body: JSON.stringify({
      config: {
        autoDecodingConfig: {},
        features: {
          enableAutomaticPunctuation: true,
        },
        languageCodes: [DEFAULT_LANGUAGE_CODE],
        model,
      },
      files: [{ uri: gcsUri }],
      recognitionOutputConfig: {
        inlineResponseConfig: {},
      },
    }),
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const data = (await response.json().catch(() => ({}))) as BatchRecognizeOperation;
  if (!response.ok || !data.name) {
    throw new Error(data.error?.message || 'Google Speech не принял batchRecognize request.');
  }

  return data.name;
};

const pollBatchRecognizeOperation = async (operationName: string) => {
  const accessToken = await getGoogleCloudAccessToken();
  const operationPath = operationName.replace(/^\/+/, '');
  const operationUrl = `${GOOGLE_SPEECH_ENDPOINT}/${operationPath}`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < LONG_RUNNING_TIMEOUT_MS) {
    const response = await proxyFetch(operationUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: 'GET',
    });

    const data = (await response.json().catch(() => ({}))) as BatchRecognizeOperation;

    if (!response.ok) {
      throw new Error(data.error?.message || 'Не удалось получить статус Google Speech operation.');
    }

    if (data.done) {
      if (data.error?.message) {
        throw new Error(data.error.message);
      }

      return data.response?.results ?? {};
    }

    await sleep(LONG_RUNNING_POLL_INTERVAL_MS);
  }

  throw new Error('Google Speech transcription timed out.');
};

const extractSpeechSegments = (
  resultsByFile: Record<string, BatchRecognizeFileResult>,
  gcsUri: string,
): PostCallSpeechSegment[] => {
  const fileResults =
    Object.keys(resultsByFile).length === 0
      ? []
      : [resultsByFile[gcsUri], ...Object.values(resultsByFile)].filter(
          (item): item is BatchRecognizeFileResult => Boolean(item),
        );

  const uniqueResults = Array.from(new Set(fileResults));

  return uniqueResults
    .flatMap((fileResult) => {
      if (fileResult.error?.message) {
        throw new Error(fileResult.error.message);
      }

      const transcriptResults =
        fileResult.inlineResult?.transcript?.results ?? fileResult.transcript?.results ?? [];

      return transcriptResults.flatMap((result) => {
        const alternative = result.alternatives?.[0];
        if (!alternative) return [];

        const text = alternative.transcript?.trim();
        if (!text) return [];

        return [
          {
            confidence: alternative.confidence,
            endTimeMs: parseDurationToMs(result.resultEndOffset),
            text,
          },
        ];
      });
    })
    .filter((segment) => segment.text.length > 0);
};

export const transcribeVoiceCallAudioWithGoogle = async (
  audioBuffer: Buffer,
  mimeType = 'audio/wav',
): Promise<PostCallSpeechToTextResult> => {
  const bucket = getGoogleSpeechBucket();
  const project = getGoogleSpeechProject();

  if (!bucket || !project) {
    throw new Error('Google Speech-to-Text is not fully configured.');
  }

  const uploaded = await uploadTempAudioToGcs(audioBuffer, mimeType);

  try {
    const operationName = await startBatchRecognize(uploaded.uri);
    const rawResults = await pollBatchRecognizeOperation(operationName);
    const segments = extractSpeechSegments(rawResults, uploaded.uri);

    return {
      segments,
      transcriptText: segments
        .map((segment) => segment.text)
        .join(' ')
        .trim(),
    };
  } finally {
    await deleteTempAudioFromGcs(uploaded.bucket, uploaded.objectName);
  }
};
