'use client';

import { Flexbox, Icon, Skeleton, Text } from '@lobehub/ui';
import { useTheme } from 'antd-style';
import { Progress } from 'antd';
import { Info } from 'lucide-react';
import { memo } from 'react';
import useSWR from 'swr';

interface TokenLimitsData {
  remaining: number;
  tokenQuota: number;
  tokensUsed: number;
}

const fetcher = async (url: string): Promise<TokenLimitsData> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch token limits');
  return res.json();
};

const TokenLimits = memo(() => {
  const theme = useTheme();
  const { data, error, isLoading } = useSWR<TokenLimitsData>('/api/user/token-limits', fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
    revalidateOnFocus: true,
  });

  if (isLoading) {
    return (
      <Flexbox gap={12} style={{ width: '100%' }}>
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
    <Flexbox gap={12} style={{ width: '100%' }}>
      <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
        <Flexbox horizontal align="center" gap={8}>
          <Icon
            icon={Info}
            style={{
              color: isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : theme.colorTextSecondary,
            }}
          />
          <Text weight={500}>Использование токенов</Text>
        </Flexbox>
        <Text style={{ fontSize: 12 }} type="secondary">
          {tokensUsed.toLocaleString()} / {tokenQuota.toLocaleString()}
        </Text>
      </Flexbox>

      <Progress
        percent={usagePercent}
        showInfo={false}
        strokeColor={isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : '#1890ff'}
        style={{ width: '100%', marginBottom: 0 }}
        railColor={theme.colorFillTertiary}
      />

      <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
        <Text style={{ fontSize: 12 }} type="secondary">
          Осталось токенов
        </Text>
        <Text
          weight={500}
          style={{
            fontSize: 14,
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
