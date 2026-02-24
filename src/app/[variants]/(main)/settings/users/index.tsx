'use client';

import { Flexbox, FormGroup } from '@lobehub/ui';
import { App, Button, Input, Progress, Space, Table, Tag, Typography } from 'antd';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';

import SettingHeader from '@/app/[variants]/(main)/settings/features/SettingHeader';

const { Text } = Typography;

const ADMIN_USERS_API = '/api/admin/users';

const DEFAULT_TOKEN_QUOTA = 100_000;

interface UserCodeRow {
  id: string;
  userId: string;
  email: string;
  code: string;
  tokenQuota?: number;
  tokensUsed?: number;
  createdAt: string;
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
  const errorMessage = error?.message || (data?.error ? String(data.error) : null);

  const handleSimulateUsage = async (userId: string, tokens: number) => {
    try {
      const res = await fetch('/api/admin/users/simulate-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tokens }),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.error || 'Failed to simulate usage');
        return;
      }
      message.success(`Added ${tokens.toLocaleString()} tokens`);
      mutate();
    } catch {
      message.error('Failed to simulate usage');
    }
  };

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const emailInput = form.querySelector<HTMLInputElement>('input[name="email"]');
    const quotaInput = form.querySelector<HTMLInputElement>('input[name="tokenQuota"]');
    const email = emailInput?.value?.trim();
    if (!email) {
      message.error(t('users.emailRequired'));
      return;
    }
    const tokenQuota =
      quotaInput && quotaInput.value !== ''
        ? Math.max(0, parseInt(quotaInput.value, 10) || 0)
        : DEFAULT_TOKEN_QUOTA;
    try {
      const res = await fetch(ADMIN_USERS_API, {
        body: JSON.stringify({ email, tokenQuota }),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.details || json.error || t('users.addError'));
        return;
      }
      message.success(
        t('users.addSuccess', { email: json.email, code: json.code }),
      );
      if (emailInput) emailInput.value = '';
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
          <Button onClick={() => mutate()} loading={isLoading}>
            {t('common.refresh', { defaultValue: 'Refresh' })}
          </Button>
        }
      />
      
      {users.length > 0 && (
        <FormGroup
          collapsible={false}
          title={t('users.statistics', { defaultValue: 'Statistics' })}
          variant="filled"
        >
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Space size="large" wrap>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('users.totalUsers', { defaultValue: 'Total Users' })}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{users.length}</div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('users.totalQuota', { defaultValue: 'Total Token Quota' })}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{totalTokens.toLocaleString()}</div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('users.usedTokens', { defaultValue: 'Used Tokens' })}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 600, color: usagePercent >= 90 ? 'var(--colorError)' : undefined }}>
                  {usedTokens.toLocaleString()}
                </div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('users.overallUsage', { defaultValue: 'Overall Usage' })}
                </Text>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{usagePercent}%</div>
              </div>
            </Space>
            <Progress 
              percent={usagePercent} 
              status={usagePercent >= 90 ? 'exception' : usagePercent >= 70 ? 'normal' : 'success'}
              size={[undefined, 12]}
            />
          </Space>
        </FormGroup>
      )}
      
      <FormGroup
        collapsible={false}
        title={t('users.addTitle')}
        variant="filled"
      >
        <form onSubmit={handleAddUser}>
          <Flexbox gap={12} style={{ flexWrap: 'wrap' }} horizontal>
            <Input
              name="email"
              placeholder={t('users.emailPlaceholder')}
              style={{ minWidth: 200, maxWidth: 320 }}
              type="email"
            />
            <Input
              name="tokenQuota"
              min={0}
              placeholder={t('users.tokenQuotaPlaceholder')}
              style={{ width: 140 }}
              type="number"
              defaultValue={DEFAULT_TOKEN_QUOTA}
            />
            <Button htmlType="submit" type="primary">
              {t('users.addButton')}
            </Button>
          </Flexbox>
        </form>
      </FormGroup>
      <FormGroup
        collapsible={false}
        title={t('users.listTitle')}
        variant="filled"
      >
        {errorMessage && (
          <Flexbox gap={8} style={{ color: 'var(--colorError)' }} direction="vertical">
            {t('users.loadError')}
            {errorMessage && errorMessage !== t('users.loadError') && (
              <span style={{ fontSize: 12, opacity: 0.9 }}>{errorMessage}</span>
            )}
          </Flexbox>
        )}
        {!errorMessage && (
          <div style={{ overflowX: 'auto' }}>
            <Table
              columns={[
                { 
                  dataIndex: 'email', 
                  key: 'email', 
                  title: t('users.emailColumn'), 
                  width: 220,
                  ellipsis: true,
                },
                { 
                  dataIndex: 'code', 
                  key: 'code', 
                  title: t('users.codeColumn'), 
                  width: 180,
                  render: (code: string) => (
                    <Space size="small">
                      <Text code copyable={{ text: code, tooltips: ['Copy', 'Copied!'] }}>
                        {code}
                      </Text>
                    </Space>
                  ),
                },
                {
                  key: 'usage',
                  title: t('users.usageColumn', { defaultValue: 'Token Usage' }),
                  width: 280,
                  render: (_: any, record: UserCodeRow) => {
                    const quota = record.tokenQuota ?? DEFAULT_TOKEN_QUOTA;
                    const used = record.tokensUsed ?? 0;
                    const percent = quota > 0 ? Math.round((used / quota) * 100) : 0;
                    const status = percent >= 90 ? 'exception' : percent >= 70 ? 'normal' : 'success';
                    
                    return (
                      <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                          <Text type="secondary">{used.toLocaleString()} / {quota.toLocaleString()}</Text>
                          <Space size={4}>
                            <Text type={percent >= 90 ? 'danger' : 'secondary'}>{percent}%</Text>
                            <Button 
                              size="small" 
                              type="text"
                              onClick={() => handleSimulateUsage(record.userId, 1000)}
                              style={{ padding: '0 4px', fontSize: '11px', height: '20px' }}
                            >
                              +1k
                            </Button>
                          </Space>
                        </div>
                        <Progress 
                          percent={percent} 
                          size="small" 
                          status={status}
                          showInfo={false}
                        />
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
                    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
                    
                    let tag = null;
                    if (diffDays === 0) tag = <Tag color="green">{t('users.today', { defaultValue: 'Today' })}</Tag>;
                    else if (diffDays === 1) tag = <Tag color="blue">{t('users.yesterday', { defaultValue: 'Yesterday' })}</Tag>;
                    else if (diffDays <= 7) tag = <Tag>{t('users.daysAgo', { defaultValue: '{{count}}d ago', count: diffDays })}</Tag>;
                    
                    return (
                      <Space orientation="vertical" size={0}>
                        {tag}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </Text>
                      </Space>
                    );
                  },
                  title: t('users.createdColumn'),
                  width: 140,
                },
              ]}
              dataSource={users}
              loading={isLoading}
              pagination={{ 
                pageSize: 10, 
                showSizeChanger: true,
                showTotal: (total) => t('users.totalCount', { defaultValue: 'Total: {{count}} users', count: total }),
              }}
              rowKey="id"
              scroll={{ x: 800 }}
              size="small"
            />
          </div>
        )}
      </FormGroup>
    </Flexbox>
  );
};

export default Page;
