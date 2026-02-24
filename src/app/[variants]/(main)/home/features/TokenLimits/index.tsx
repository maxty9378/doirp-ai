'use client';

import { Flexbox, Icon, Skeleton, Text } from '@lobehub/ui';
import { Progress } from 'antd';
import { Info } from 'lucide-react';
import { memo } from 'react';
import useSWR from 'swr';

interface TokenLimitsData {
  tokenQuota: number;
  tokensUsed: number;
  remaining: number;
}

const fetcher = async (url: string): Promise<TokenLimitsData> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch token limits');
  return res.json();
};

const TokenLimits = memo(() => {
  const { data, error, isLoading } = useSWR<TokenLimitsData>('/api/user/token-limits', fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
    revalidateOnFocus: true,
  });

  if (isLoading) {
    return (
      <Flexbox
        gap={12}
        padding={16}
        style={{
          background: 'rgba(0, 0, 0, 0.02)',
          borderRadius: 12,
        }}
      >
        <Skeleton.Button active size="small" style={{ width: 200 }} />
        <Skeleton.Button active size="large" style={{ width: '100%' }} />
      </Flexbox>
    );
  }

  if (error || !data) {
    return null;
  }

  const { tokenQuota, tokensUsed, remaining } = data;
  const usagePercent = tokenQuota > 0 ? Math.round((tokensUsed / tokenQuota) * 100) : 0;
  const isLow = remaining < tokenQuota * 0.2; // Less than 20% remaining
  const isCritical = remaining < tokenQuota * 0.1; // Less than 10% remaining

  return (
    <Flexbox
      gap={12}
      padding={16}
      style={{
        background: isCritical
          ? 'rgba(255, 77, 79, 0.08)'
          : isLow
            ? 'rgba(255, 163, 77, 0.08)'
            : 'rgba(0, 0, 0, 0.02)',
        borderRadius: 12,
        border: isCritical
          ? '1px solid rgba(255, 77, 79, 0.2)'
          : isLow
            ? '1px solid rgba(255, 163, 77, 0.2)'
            : '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      <Flexbox horizontal align="center" justify="space-between">
        <Flexbox horizontal align="center" gap={8}>
          <Icon
            icon={Info}
            style={{
              color: isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : 'rgba(0, 0, 0, 0.45)',
            }}
          />
          <Text weight={500}>Использование токенов</Text>
        </Flexbox>
        <Text type="secondary" size={12}>
          {tokensUsed.toLocaleString()} / {tokenQuota.toLocaleString()}
        </Text>
      </Flexbox>

      <Progress
        percent={usagePercent}
        strokeColor={isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : '#1890ff'}
        trailColor="rgba(0, 0, 0, 0.06)"
        showInfo={false}
      />

      <Flexbox horizontal align="center" justify="space-between">
        <Text size={12} type="secondary">
          Осталось токенов
        </Text>
        <Text
          size={14}
          weight={500}
          style={{
            color: isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : undefined,
          }}
        >
          {remaining.toLocaleString()}
        </Text>
      </Flexbox>
    </Flexbox>
  );
});

export default TokenLimits;
