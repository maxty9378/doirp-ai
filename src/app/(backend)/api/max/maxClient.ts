import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://platform-api.max.ru';

export type MaxAttachmentType = 'file' | 'image' | 'video';
export type MaxSenderAction = 'typing_on' | 'sending_file' | 'sending_photo' | 'sending_video';

export interface MaxConfig {
  apiToken: string;
  baseUrl: string;
}

export interface MaxButton {
  id: string;
  text: string;
}

export interface MaxMessageMetadata {
  attachments?: MaxAttachmentRequest[];
  format?: 'html' | 'markdown';
  notify?: boolean;
}

export interface MaxAttachmentRequest {
  payload: Record<string, unknown>;
  type: string;
}

interface UploadLinkResponse {
  token?: string;
  url: string;
}

interface MaxApiError extends Error {
  body?: string;
  status?: number;
}

type MaxLogLevel = 'error' | 'info';
type MaxLogger = (entry: {
  details?: string;
  level: MaxLogLevel;
  message: string;
}) => Promise<void>;

export class MaxAPI {
  private readonly configPath = path.join(process.cwd(), 'config.json');
  private readonly defaultTimeoutMs = 10_000;
  private readonly log: MaxLogger;

  constructor(logger?: MaxLogger) {
    this.log = logger || (async () => undefined);
  }

  public async sendMessage(to: number, text: string, metadata?: MaxMessageMetadata) {
    return this.request('/messages', {
      body: {
        ...metadata,
        text,
      },
      query: { user_id: String(to) },
    });
  }

  public async sendButtons(to: number, text: string, buttons: MaxButton[]) {
    const keyboardAttachment: MaxAttachmentRequest = {
      payload: {
        buttons: buttons.map((button) => [
          {
            payload: button.id,
            text: button.text,
            type: 'callback',
          },
        ]),
      },
      type: 'inline_keyboard',
    };

    return this.sendMessage(to, text, {
      attachments: [keyboardAttachment],
    });
  }

  public async sendAttachment(to: number, fileType: MaxAttachmentType, fileUrl: string) {
    const normalizedType = fileType === 'image' ? 'image' : fileType;
    const link = await this.request<UploadLinkResponse>(`/uploads?type=${normalizedType}`, {
      method: 'POST',
    });
    const uploadBody = await this.downloadAsFormData(fileUrl);

    const uploadResponse = await this.fetchWithTimeout(link.url, {
      body: uploadBody,
      headers: await this.authHeaders(),
      method: 'POST',
    });

    if (!uploadResponse.ok) {
      throw await this.createApiError('Ошибка загрузки вложения в MAX', uploadResponse);
    }

    const uploadJson = (await uploadResponse.json().catch(() => ({}))) as { token?: string };
    const token = uploadJson.token || link.token;

    if (!token) {
      throw new Error('MAX API не вернул token для вложения');
    }

    return this.sendMessage(to, '', {
      attachments: [
        {
          payload: { token },
          type: normalizedType,
        },
      ],
    });
  }

  public async setWebhook(url: string) {
    return this.request('/subscriptions', {
      body: {
        update_types: ['message_created', 'message_callback', 'bot_started'],
        url,
      },
      method: 'POST',
    });
  }

  public async getUserProfile(userId: number) {
    try {
      return await this.request(`/users/${userId}`, { method: 'GET' });
    } catch {
      return this.request('/me', { method: 'GET' });
    }
  }

  public async sendTypingSignal(chatId: number) {
    return this.request(`/chats/${chatId}/actions`, {
      body: { action: 'typing_on' as MaxSenderAction },
      method: 'POST',
    });
  }

  private async request<T = unknown>(
    endpoint: string,
    options?: {
      body?: unknown;
      method?: 'GET' | 'PATCH' | 'POST' | 'PUT';
      query?: Record<string, string>;
    },
  ): Promise<T> {
    const config = await this.getConfig();
    const method = options?.method || 'POST';
    const query = options?.query ? `?${new URLSearchParams(options.query).toString()}` : '';
    const targetUrl = `${config.baseUrl.replace(/\/$/, '')}${endpoint}${query}`;

    const response = await this.fetchWithTimeout(targetUrl, {
      body: options?.body ? JSON.stringify(options.body) : undefined,
      headers: await this.authHeaders(config.apiToken),
      method,
    });

    if (!response.ok) {
      const error = await this.createApiError(`MAX API error on ${endpoint}`, response);

      await this.log({
        details: error.body,
        level: 'error',
        message: `${error.message} (${error.status || 'unknown'})`,
      });

      throw error;
    }

    return response.json() as Promise<T>;
  }

  private async authHeaders(token?: string) {
    const config = token ? null : await this.getConfig();

    return {
      'Authorization': token || config!.apiToken,
      'Content-Type': 'application/json',
    };
  }

  private async createApiError(message: string, response: Response): Promise<MaxApiError> {
    const body = await response.text();
    const error = new Error(message) as MaxApiError;
    error.body = body;
    error.status = response.status;
    error.message = this.decorateErrorMessage(message, response.status, body);
    return error;
  }

  private decorateErrorMessage(message: string, status: number, body: string) {
    if (status === 429) return `${message}: превышен лимит запросов (429)`;
    if (status === 401) return `${message}: недействительный токен (401)`;
    return `${message}: HTTP ${status}${body ? ` - ${body}` : ''}`;
  }

  private async getConfig(): Promise<MaxConfig> {
    const fallback: MaxConfig = {
      apiToken: '',
      baseUrl: DEFAULT_BASE_URL,
    };

    try {
      const raw = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<MaxConfig>;

      return {
        apiToken: parsed.apiToken?.trim() || fallback.apiToken,
        baseUrl: parsed.baseUrl?.trim() || fallback.baseUrl,
      };
    } catch {
      return fallback;
    }
  }

  private async downloadAsFormData(fileUrl: string) {
    const response = await this.fetchWithTimeout(fileUrl, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Не удалось скачать файл по URL: ${fileUrl}`);
    }

    const blob = await response.blob();
    const pathname = (() => {
      try {
        return new URL(fileUrl).pathname;
      } catch {
        return '/attachment.bin';
      }
    })();
    const guessedName = pathname.split('/').findLast(Boolean) || 'attachment.bin';

    const formData = new FormData();
    formData.append('data', blob, guessedName);
    return formData;
  }

  private async fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MAX API timeout (${this.defaultTimeoutMs}ms): ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
