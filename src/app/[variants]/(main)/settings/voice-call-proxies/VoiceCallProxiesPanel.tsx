'use client';

import { Flexbox, Form, type FormGroupItemType } from '@lobehub/ui';
import { App, Button, Input, Switch, Table, Tag, Tooltip } from 'antd';
import { Cable, HardDrive } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { FORM_STYLE } from '@/const/layoutTokens';

export type VoiceCallProxyRow = {
  createdAt?: string;
  enabled: boolean;
  id: string;
  lastCheckAt?: string | null;
  lastCheckError?: string | null;
  lastCheckLatencyMs?: number | null;
  lastCheckOk?: boolean | null;
  priority: number;
  url: string;
};

const formatDateTime = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
};

export const VoiceCallProxiesPanel = () => {
  const { message } = App.useApp();
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxies, setProxies] = useState<VoiceCallProxyRow[]>([]);

  const fetchProxies = useCallback(async () => {
    setProxyLoading(true);
    setProxyError(null);
    try {
      const res = await fetch('/api/admin/voice-call/proxies', { credentials: 'include' });
      const json = (await res.json().catch(() => ({}))) as { error?: string; items?: unknown };
      if (!res.ok) throw new Error(json.error || `Ошибка загрузки прокси: ${res.status}`);
      const items = Array.isArray(json.items)
        ? (json.items as VoiceCallProxyRow[])
        : [];
      setProxies(items);
    } catch (e) {
      setProxyError(e instanceof Error ? e.message : 'Не удалось загрузить список прокси');
    } finally {
      setProxyLoading(false);
    }
  }, []);

  const checkProxies = useCallback(
    async (ids?: string[]) => {
      setProxyLoading(true);
      setProxyError(null);
      try {
        const res = await fetch('/api/admin/voice-call/proxies/check', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ids?.length ? { ids } : {}),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error || `Ошибка проверки прокси: ${res.status}`);
        await fetchProxies();
        message.success('Проверка выполнена');
      } catch (e) {
        const txt = e instanceof Error ? e.message : 'Не удалось проверить прокси';
        setProxyError(txt);
        message.error(txt);
      } finally {
        setProxyLoading(false);
      }
    },
    [fetchProxies, message],
  );

  const addProxy = useCallback(async () => {
    const raw = proxyUrl.trim();
    if (!raw) {
      message.error('Введите прокси');
      return;
    }

    const items = raw
      .split(/[\r\n]+/)
      .flatMap((line) => line.split(/[,\s]+/g))
      .map((s) => s.trim())
      .filter(Boolean);

    if (items.length === 0) {
      message.error('Введите прокси');
      return;
    }

    setProxyLoading(true);
    setProxyError(null);

    let okCount = 0;
    let failCount = 0;
    let lastError: string | null = null;

    try {
      for (const url of items) {
        const res = await fetch('/api/admin/voice-call/proxies', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, enabled: true, priority: 1000 }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          failCount += 1;
          lastError = json.error || `Ошибка добавления прокси: ${res.status}`;
          continue;
        }
        okCount += 1;
      }

      if (okCount > 0) {
        setProxyUrl('');
        await fetchProxies();
      }

      if (failCount === 0) {
        message.success(`Добавлено: ${okCount}`);
      } else {
        const txt = `Добавлено: ${okCount}, ошибок: ${failCount}${lastError ? ` — ${lastError}` : ''}`;
        setProxyError(txt);
        message.warning(txt);
      }
    } catch (e) {
      const txt = e instanceof Error ? e.message : 'Не удалось добавить прокси';
      setProxyError(txt);
      message.error(txt);
    } finally {
      setProxyLoading(false);
    }
  }, [fetchProxies, message, proxyUrl]);

  const patchProxy = useCallback(
    async (id: string, patch: Partial<{ enabled: boolean; priority: number; url: string }>) => {
      setProxyLoading(true);
      setProxyError(null);
      try {
        const res = await fetch(`/api/admin/voice-call/proxies/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error || `Ошибка обновления прокси: ${res.status}`);
        await fetchProxies();
      } catch (e) {
        const txt = e instanceof Error ? e.message : 'Не удалось обновить прокси';
        setProxyError(txt);
        message.error(txt);
      } finally {
        setProxyLoading(false);
      }
    },
    [fetchProxies, message],
  );

  const deleteProxy = useCallback(
    async (id: string) => {
      setProxyLoading(true);
      setProxyError(null);
      try {
        const res = await fetch(`/api/admin/voice-call/proxies/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error || `Ошибка удаления прокси: ${res.status}`);
        await fetchProxies();
        message.success('Прокси удалён');
      } catch (e) {
        const txt = e instanceof Error ? e.message : 'Не удалось удалить прокси';
        setProxyError(txt);
        message.error(txt);
      } finally {
        setProxyLoading(false);
      }
    },
    [fetchProxies, message],
  );

  useEffect(() => {
    void fetchProxies();
  }, [fetchProxies]);

  useEffect(() => {
    const timer = setInterval(() => {
      void checkProxies();
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [checkProxies]);

  return (
    <Form
      itemsType="group"
      variant="filled"
      {...FORM_STYLE}
      items={[
        {
          title: 'Добавление прокси',
          icon: Cable,
          children: [
            {
              minWidth: '100%',
              children: (
                <Flexbox gap={12} width={'100%'}>
                  <div style={{ color: 'var(--colorTextSecondary)', fontSize: 14 }}>
                    Список для добавления. Форматы: <code>http(s)://USER:PASS@HOST:PORT</code>, <code>socks5://HOST:PORT</code>, <code>HOST:PORT</code> или <code>HOST:PORT:USER:PASS</code>. Можно вставить список — по одной строке.
                  </div>
                  <Input.TextArea
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    placeholder="23.95.150.145:6114:user:pass&#13;&#10;http://user:pass@198.23.239.134:6540"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                  />
                  <Flexbox horizontal justify={'flex-end'}>
                    <Button loading={proxyLoading} type="primary" onClick={addProxy}>
                      Добавить
                    </Button>
                  </Flexbox>
                </Flexbox>
              ),
            },
          ],
        },
        {
          title: 'База прокси (Gemini Live)',
          icon: HardDrive,
          extra: (
            <Flexbox horizontal gap={8}>
              <Button size="small" loading={proxyLoading} onClick={fetchProxies}>
                Обновить
              </Button>
              <Button size="small" loading={proxyLoading} onClick={() => void checkProxies()}>
                Проверить все сейчас
              </Button>
            </Flexbox>
          ),
          children: [
            {
              minWidth: '100%',
              children: (
                <Flexbox gap={16} width={'100%'}>
                  <div style={{ color: 'var(--colorTextSecondary)', fontSize: 14 }}>
                    Серверный WebSocket-прокси использует включённые записи по приоритету (меньше — раньше). Для применения изменений перезапустите процесс прокси на сервере.
                  </div>
                  {proxyError && <div style={{ color: 'var(--colorError)' }}>{proxyError}</div>}
                  <Table
                    columns={[
                      {
                        dataIndex: 'enabled',
                        render: (value: boolean, record: VoiceCallProxyRow) => (
                          <Switch
                            checked={!!value}
                            onChange={(checked) => void patchProxy(record.id, { enabled: checked })}
                          />
                        ),
                        title: 'Вкл',
                        width: 70,
                      },
                      { dataIndex: 'priority', title: 'Приоритет', width: 90 },
                      {
                        dataIndex: 'lastCheckOk',
                        render: (_: unknown, record: VoiceCallProxyRow) => {
                          const ok = record.lastCheckOk;
                          const tipLines = [
                            record.lastCheckAt
                              ? `Проверка: ${formatDateTime(record.lastCheckAt)}`
                              : 'Проверка: нет данных',
                            typeof record.lastCheckLatencyMs === 'number'
                              ? `Время ответа: ${record.lastCheckLatencyMs} мс`
                              : 'Время ответа: —',
                            record.lastCheckError ? `Ошибка: ${record.lastCheckError}` : null,
                          ].filter(Boolean) as string[];

                          const label =
                            ok === null || ok === undefined ? 'Не проверено' : ok ? 'Доступен' : 'Недоступен';
                          const color = ok === null || ok === undefined ? 'default' : ok ? 'green' : 'red';

                          return (
                            <Tooltip title={tipLines.join('\n')}>
                              <Tag color={color as any}>{label}</Tag>
                            </Tooltip>
                          );
                        },
                        title: 'Статус',
                        width: 140,
                      },
                      { dataIndex: 'url', title: 'URL' },
                      {
                        render: (_: unknown, record: VoiceCallProxyRow) => (
                          <Flexbox horizontal gap={8}>
                            <Button size="small" onClick={() => void checkProxies([record.id])}>
                              Проверить
                            </Button>
                            <Button size="small" danger onClick={() => void deleteProxy(record.id)}>
                              Удалить
                            </Button>
                          </Flexbox>
                        ),
                        title: 'Действия',
                        width: 180,
                      },
                    ]}
                    dataSource={proxies}
                    loading={proxyLoading}
                    pagination={false}
                    rowKey="id"
                    size="small"
                  />
                </Flexbox>
              ),
            },
          ],
        },
      ]}
    />
  );
};
