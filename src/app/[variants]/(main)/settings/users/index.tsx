'use client';

import {
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Flexbox, FormGroup } from '@lobehub/ui';
import {
  App,
  Button,
  Input,
  InputNumber,
  Popconfirm,
  Popover,
  Progress,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import SettingHeader from '@/app/[variants]/(main)/settings/features/SettingHeader';

const { Text } = Typography;

const ADMIN_USERS_API = '/api/admin/users';

const DEFAULT_TOKEN_QUOTA = 1_000_000;
const UNLIMITED_QUOTA = 100_000_000;

const CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generatePassword(length = 10): string {
  let s = '';
  for (let i = 0; i < length; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

interface UserCodeRow {
  code: string;
  createdAt: string;
  dailyImageCount?: number;
  email: string;
  id: string;
  lastImageDate?: string | null;
  password?: string;
  tokenQuota?: number;
  tokensUsed?: number;
  userId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.details || json.error || res.statusText);
  return json;
};

const Page = ({ mobile }: { mobile?: boolean }) => {
  const { message } = App.useApp();
  const { t } = useTranslation('setting');
  const { data, error, isLoading, mutate } = useSWR<{ users: UserCodeRow[] }>(
    ADMIN_USERS_API,
    fetcher,
  );
  const users = data?.users ?? [];
  const errorMessage = error?.message ?? null;

  const [addEmail, setAddEmail] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, string>>({});
  const [passwordRevealed, setPasswordRevealed] = useState<Record<string, boolean>>({});
  const [addTokensUserId, setAddTokensUserId] = useState<string | null>(null);
  const [addTokensAmount, setAddTokensAmount] = useState(1000);

  useEffect(() => {
    if (!data?.users) return;
    setVisiblePasswords((prev) => {
      const next = { ...prev };
      for (const u of data.users) {
        if (u.password) next[u.userId] = u.password;
      }
      return next;
    });
  }, [data?.users]);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value?.trim() ?? '';
    setAddEmail(v);
    if (v) setGeneratedPassword(generatePassword());
    else setGeneratedPassword('');
  };

  const handleIncreaseQuota = async (userId: string, currentQuota: number, addAmount: number) => {
    try {
      const newQuota = currentQuota + addAmount;
      const res = await fetch('/api/admin/users/set-quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tokenQuota: newQuota }),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || 'Не удалось увеличить лимит');
        return;
      }
      message.success(`Лимит увеличен на ${addAmount.toLocaleString()}`);
      setAddTokensUserId(null);
      mutate();
    } catch {
      message.error('Не удалось увеличить лимит');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || 'Не удалось удалить пользователя');
        return;
      }
      message.success(t('users.deleteSuccess', { defaultValue: 'Пользователь удалён' }));
      setVisiblePasswords((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setPasswordRevealed((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      mutate();
    } catch {
      message.error('Не удалось удалить пользователя');
    }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || 'Не удалось сбросить пароль');
        return;
      }
      const password = json.password as string;
      setVisiblePasswords((prev) => ({ ...prev, [userId]: password }));
      setPasswordRevealed((prev) => ({ ...prev, [userId]: true }));
      void navigator.clipboard.writeText(password);
      message.success(t('users.passwordCopied', { defaultValue: 'Скопировано' }));
    } catch {
      message.error('Не удалось сбросить пароль');
    }
  };

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const quotaInput = form.querySelector<HTMLInputElement>('input[name="tokenQuota"]');
    const email = addEmail.trim();
    if (!email) {
      message.error(t('users.emailRequired'));
      return;
    }
    const password = generatedPassword;
    if (!password || password.length < 6) {
      message.error(t('users.passwordRequired'));
      return;
    }
    const tokenQuota =
      quotaInput && quotaInput.value !== ''
        ? Math.max(0, parseInt(quotaInput.value, 10) || 0)
        : DEFAULT_TOKEN_QUOTA;
    try {
      const res = await fetch(ADMIN_USERS_API, {
        body: JSON.stringify({ email, password, tokenQuota }),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        const errorMsg =
          json.error === 'Email already registered'
            ? t('users.emailAlreadyRegistered')
            : json.error?.includes('Password')
              ? t('users.passwordRequired')
              : json.details || json.error || t('users.addError');
        message.error(errorMsg);
        return;
      }
      message.success(t('users.addSuccessEmailPassword'));
      if (json.userId) {
        setVisiblePasswords((prev) => ({ ...prev, [json.userId]: password }));
        setPasswordRevealed((prev) => ({ ...prev, [json.userId]: true }));
      }
      setAddEmail('');
      setGeneratedPassword('');
      if (quotaInput) quotaInput.value = String(DEFAULT_TOKEN_QUOTA);
      mutate();
    } catch {
      message.error(t('users.addError'));
    }
  };

  const totalTokens = users.reduce((sum, u) => sum + (u.tokenQuota ?? DEFAULT_TOKEN_QUOTA), 0);
  const usedTokens = users.reduce((sum, u) => sum + (u.tokensUsed ?? 0), 0);
  const usagePercent = totalTokens > 0 ? Math.round((usedTokens / totalTokens) * 100) : 0;

  return (
    <Flexbox gap={24} style={{ width: '100%' }}>
      <SettingHeader
        title={t('tab.users')}
        extra={
          <Button loading={isLoading} onClick={() => mutate()}>
            {t('common.refresh', { defaultValue: 'Обновить' })}
          </Button>
        }
      />

      {users.length > 0 && (
        <FormGroup
          collapsible={false}
          title={t('users.statistics', { defaultValue: 'Статистика' })}
          variant="filled"
        >
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Space wrap size="large">
              <div>
                <Text style={{ fontSize: 12 }} type="secondary">
                  {t('users.totalUsers', { defaultValue: 'Всего пользователей' })}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{users.length}</div>
              </div>
              <div>
                <Text style={{ fontSize: 12 }} type="secondary">
                  {t('users.totalQuota', { defaultValue: 'Общий лимит токенов' })}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <Text style={{ fontSize: 12 }} type="secondary">
                  {t('users.usedTokens', {
                    defaultValue: 'Всего сожжено токенов по отделу',
                  })}
                </Text>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: usagePercent >= 90 ? 'var(--colorError)' : undefined,
                  }}
                >
                  {usedTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <Text style={{ fontSize: 12 }} type="secondary">
                  {t('users.overallUsage', { defaultValue: 'Общее использование' })}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{usagePercent}%</div>
              </div>
            </Space>
            <Progress
              percent={usagePercent}
              size={{ height: 12 }}
              status={usagePercent >= 90 ? 'exception' : usagePercent >= 70 ? 'normal' : 'success'}
            />
          </Space>
        </FormGroup>
      )}

      <FormGroup collapsible={false} title={t('users.addTitle')} variant="filled">
        <form onSubmit={handleAddUser}>
          <Flexbox horizontal gap={12} style={{ flexWrap: 'wrap' }}>
            <Input
              name="email"
              placeholder={t('users.emailPlaceholder')}
              style={{ minWidth: 200, maxWidth: 320 }}
              type="email"
              value={addEmail}
              onChange={handleEmailChange}
            />
            <Input
              readOnly
              placeholder={t('users.passwordPlaceholder')}
              style={{ minWidth: 180, maxWidth: 240 }}
              value={generatedPassword}
              addonAfter={
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    if (generatedPassword) {
                      void navigator.clipboard.writeText(generatedPassword);
                      message.success(t('users.passwordCopied', { defaultValue: 'Скопировано' }));
                    }
                  }}
                >
                  {t('users.copy', { defaultValue: 'Скопировать' })}
                </Button>
              }
            />
            <Input
              defaultValue={DEFAULT_TOKEN_QUOTA}
              min={0}
              name="tokenQuota"
              placeholder={t('users.tokenQuotaPlaceholder')}
              style={{ width: 140 }}
              type="number"
            />
            <Button htmlType="submit" type="primary">
              {t('users.addButton')}
            </Button>
          </Flexbox>
        </form>
      </FormGroup>
      <FormGroup collapsible={false} title={t('users.listTitle')} variant="filled">
        {errorMessage && (
          <Flexbox direction="vertical" gap={8} style={{ color: 'var(--colorError)' }}>
            {t('users.loadError')}
            {errorMessage && errorMessage !== t('users.loadError') && (
              <span style={{ fontSize: 12, opacity: 0.9 }}>{errorMessage}</span>
            )}
          </Flexbox>
        )}
        {!errorMessage && (
          <div style={{ overflowX: 'auto' }}>
            <Table
              dataSource={users}
              loading={isLoading}
              rowKey="id"
              scroll={{ x: 800 }}
              size="small"
              columns={[
                {
                  dataIndex: 'email',
                  key: 'email',
                  title: t('users.emailColumn'),
                  width: 220,
                  ellipsis: true,
                },
                {
                  key: 'password',
                  title: t('users.codeColumn'),
                  width: 220,
                  render: (_: unknown, record: UserCodeRow) => {
                    const pwd = visiblePasswords[record.userId];
                    const revealed = passwordRevealed[record.userId];
                    const showPassword = pwd && revealed;
                    return (
                      <Space align="center" size="small">
                        {pwd ? (
                          <>
                            <Text
                              code
                              copyable={
                                showPassword
                                  ? { text: pwd, tooltips: ['Скопировать', 'Скопировано'] }
                                  : false
                              }
                            >
                              {showPassword ? pwd : '••••••••'}
                            </Text>
                            <Tooltip
                              title={
                                showPassword
                                  ? t('users.hidePassword', { defaultValue: 'Скрыть' })
                                  : t('users.showPassword', { defaultValue: 'Показать' })
                              }
                            >
                              <Button
                                icon={showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                                size="small"
                                type="text"
                                onClick={() =>
                                  setPasswordRevealed((prev) => ({
                                    ...prev,
                                    [record.userId]: !prev[record.userId],
                                  }))
                                }
                              />
                            </Tooltip>
                          </>
                        ) : null}
                        <Popconfirm
                          cancelText={t('common.cancel', { defaultValue: 'Отмена' })}
                          okText={t('users.resetPasswordConfirmOk', {
                            defaultValue: 'Да, сбросить',
                          })}
                          title={t('users.resetPasswordConfirmTitle', {
                            defaultValue:
                              'Вы уверены? Пароль будет сброшен, пользователю нужно будет сообщить новый.',
                          })}
                          onConfirm={() => handleResetPassword(record.userId)}
                        >
                          <Tooltip title={t('users.resetPassword')}>
                            <Button icon={<ReloadOutlined />} size="small" type="text" />
                          </Tooltip>
                        </Popconfirm>
                      </Space>
                    );
                  },
                },
                {
                  key: 'images',
                  title: t('users.imagesColumn', { defaultValue: 'Картинки (день)' }),
                  width: 120,
                  render: (_: unknown, record: UserCodeRow) => {
                    const now = new Date();
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const lastDate = record.lastImageDate ? new Date(record.lastImageDate) : null;
                    const count =
                      lastDate && lastDate >= todayStart ? (record.dailyImageCount ?? 0) : 0;
                    const handleReset = async () => {
                      try {
                        const res = await fetch('/api/admin/users/reset-image-count', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ userId: record.userId }),
                        });
                        if (!res.ok) {
                          const j = await res.json();
                          message.error(j.error || 'Ошибка');
                          return;
                        }
                        message.success(
                          t('users.imageCountReset', { defaultValue: 'Счётчик обнулён' }),
                        );
                        mutate();
                      } catch {
                        message.error('Ошибка');
                      }
                    };
                    return (
                      <Space size="small">
                        <Text>{count}/5</Text>
                        {count > 0 && (
                          <Tooltip
                            title={t('users.resetImageCount', {
                              defaultValue: 'Обнулить счётчик картинок',
                            })}
                          >
                            <Button
                              icon={<ReloadOutlined />}
                              size="small"
                              type="text"
                              onClick={handleReset}
                            />
                          </Tooltip>
                        )}
                      </Space>
                    );
                  },
                },
                {
                  key: 'usage',
                  title: t('users.usageColumn', { defaultValue: 'Использование токенов' }),
                  width: 280,
                  render: (_: any, record: UserCodeRow) => {
                    const quota = record.tokenQuota ?? DEFAULT_TOKEN_QUOTA;
                    const used = record.tokensUsed ?? 0;
                    const percent = quota > 0 ? Math.round((used / quota) * 100) : 0;
                    const status =
                      percent >= 90 ? 'exception' : percent >= 70 ? 'normal' : 'success';

                    return (
                      <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 12,
                          }}
                        >
                          <Text type="secondary">
                            {used.toLocaleString()} / {quota.toLocaleString()}
                          </Text>
                          <Space size={4}>
                            <Text type={percent >= 90 ? 'danger' : 'secondary'}>{percent}%</Text>
                            <Popover
                              open={addTokensUserId === record.userId}
                              trigger="click"
                              content={
                                <Space direction="vertical" size="small" style={{ width: 200 }}>
                                  <div>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                                      {t('users.increaseQuotaTitle', {
                                        defaultValue: 'Увеличить лимит на',
                                      })}
                                    </div>
                                    <InputNumber
                                      addonAfter={t('users.tokensShort', { defaultValue: 'шт.' })}
                                      max={100_000_000}
                                      min={1}
                                      style={{ width: '100%' }}
                                      value={
                                        addTokensUserId === record.userId ? addTokensAmount : 1000
                                      }
                                      onChange={(v) => setAddTokensAmount(v ?? 1000)}
                                    />
                                  </div>
                                  <Space wrap size="small" style={{ width: '100%' }}>
                                    <Button
                                      size="small"
                                      onClick={() => {
                                        setAddTokensAmount(500_000);
                                        handleIncreaseQuota(record.userId, quota, 500_000);
                                        setAddTokensUserId(null);
                                      }}
                                    >
                                      +500k
                                    </Button>
                                    <Button
                                      size="small"
                                      onClick={() => {
                                        handleIncreaseQuota(
                                          record.userId,
                                          quota,
                                          UNLIMITED_QUOTA - quota,
                                        );
                                        setAddTokensUserId(null);
                                      }}
                                    >
                                      Безлимит
                                    </Button>
                                  </Space>
                                  <Button
                                    block
                                    size="small"
                                    type="primary"
                                    onClick={() => {
                                      handleIncreaseQuota(record.userId, quota, addTokensAmount);
                                    }}
                                  >
                                    {t('users.addTokensButton', { defaultValue: 'Начислить' })}
                                  </Button>
                                </Space>
                              }
                              onOpenChange={(open) => {
                                if (!open) setAddTokensUserId(null);
                              }}
                            >
                              <Tooltip
                                title={t('users.addTokensTooltip', {
                                  defaultValue: 'Увеличить лимит токенов',
                                })}
                              >
                                <Button
                                  icon={<PlusOutlined />}
                                  size="small"
                                  type="text"
                                  onClick={() => {
                                    setAddTokensUserId(record.userId);
                                    setAddTokensAmount(1000);
                                  }}
                                />
                              </Tooltip>
                            </Popover>
                          </Space>
                        </div>
                        <Progress percent={percent} showInfo={false} size="small" status={status} />
                      </Space>
                    );
                  },
                },
                {
                  dataIndex: 'createdAt',
                  key: 'createdAt',
                  render: (v: string) => {
                    if (!v) return '—';
                    const date = new Date(v);
                    const now = new Date();
                    const diffDays = Math.floor(
                      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
                    );

                    let tag = null;
                    if (diffDays === 0)
                      tag = (
                        <Tag color="green">{t('users.today', { defaultValue: 'Сегодня' })}</Tag>
                      );
                    else if (diffDays === 1)
                      tag = (
                        <Tag color="blue">{t('users.yesterday', { defaultValue: 'Вчера' })}</Tag>
                      );
                    else if (diffDays <= 7)
                      tag = (
                        <Tag>
                          {t('users.daysAgo', {
                            defaultValue: '{{count}} дн. назад',
                            count: diffDays,
                          })}
                        </Tag>
                      );

                    return (
                      <Space orientation="vertical" size={0}>
                        {tag}
                        <Text style={{ fontSize: 12 }} type="secondary">
                          {date.toLocaleString(undefined, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </Text>
                      </Space>
                    );
                  },
                  title: t('users.createdColumn'),
                  width: 140,
                },
                {
                  key: 'actions',
                  title: '',
                  width: 56,
                  fixed: 'right',
                  render: (_: unknown, record: UserCodeRow) => (
                    <Popconfirm
                      cancelText={t('common.cancel', { defaultValue: 'Отмена' })}
                      okButtonProps={{ danger: true }}
                      okText={t('users.deleteConfirmOk', { defaultValue: 'Удалить' })}
                      title={t('users.deleteConfirmTitle', {
                        defaultValue: 'Удалить пользователя? Это действие нельзя отменить.',
                      })}
                      onConfirm={() => handleDeleteUser(record.userId)}
                    >
                      <Tooltip
                        title={t('users.deleteUser', { defaultValue: 'Удалить пользователя' })}
                      >
                        <Button danger icon={<DeleteOutlined />} size="small" type="text" />
                      </Tooltip>
                    </Popconfirm>
                  ),
                },
              ]}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) =>
                  t('users.totalCount', { defaultValue: 'Всего: {{count}} польз.', count: total }),
              }}
            />
          </div>
        )}
      </FormGroup>
    </Flexbox>
  );
};

export default Page;
