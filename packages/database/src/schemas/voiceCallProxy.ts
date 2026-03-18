/* eslint-disable sort-keys-fix/sort-keys-fix */
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps } from './_helpers';

export const voiceCallProxies = pgTable(
  'voice_call_proxies',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('voiceCallProxies'))
      .notNull(),
    /** URL прокси: http(s)://user:pass@host:port или socks5://... */
    url: text('url').notNull(),
    /** 1 = включен, 0 = выключен (храним как int для простоты) */
    enabled: integer('enabled').notNull().default(1),
    /** Чем меньше, тем раньше используется */
    priority: integer('priority').notNull().default(1000),
    /** Последняя проверка доступности (UTC) */
    lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
    /** 1 = доступен, 0 = недоступен, null = не проверяли */
    lastCheckOk: integer('last_check_ok'),
    /** Ошибка последней проверки (если есть) */
    lastCheckError: text('last_check_error'),
    /** Время ответа последней проверки в мс (если есть) */
    lastCheckLatencyMs: integer('last_check_latency_ms'),
    ...timestamps,
  },
  (t) => [index('voice_call_proxies_priority_idx').on(t.priority), index('voice_call_proxies_enabled_idx').on(t.enabled)],
);

export type VoiceCallProxyItem = typeof voiceCallProxies.$inferSelect;
export type NewVoiceCallProxy = typeof voiceCallProxies.$inferInsert;

