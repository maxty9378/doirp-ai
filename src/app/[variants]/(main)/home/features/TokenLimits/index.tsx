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
    keepPreviousData: true,
  });

  if (isLoading && !data) {
    return (
      <Flexbox gap={12} style={{ width: '100%', padding: '4px 0' }}>
        <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
          <Skeleton.Button active size="small" style={{ width: 150, height: 20 }} />
          <Skeleton.Button active size="small" style={{ width: 60, height: 20 }} />
        </Flexbox>
        <Skeleton.Button active size="small" style={{ width: '100%', height: 8, borderRadius: 4 }} />
        <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
          <Skeleton.Button active size="small" style={{ width: 100, height: 20 }} />
          <Skeleton.Button active size="small" style={{ width: 60, height: 20 }} />
        </Flexbox>
      </Flexbox>
    );
  }

  if (error || !data) {
    return null;
  }

  const { tokenQuota, tokensUsed, remaining } = data;
  
  const displayRemaining = Math.max(0, remaining);
  const displayTokensUsed = Math.min(tokensUsed, tokenQuota);
  
  const usagePercent = tokenQuota > 0 ? Math.round((displayTokensUsed / tokenQuota) * 100) : 0;
  const isLow = displayRemaining < tokenQuota * 0.2; // Less than 20% remaining
  const isCritical = displayRemaining < tokenQuota * 0.1; // Less than 10% remaining
  const isUnlimited = tokenQuota >= 100_000_000;

  return (
    <Flexbox gap={12} style={{ width: '100%' }}>
      <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
        <Flexbox horizontal align="center" gap={8}>
          <Icon
            icon={Info}
            style={{
              color: isUnlimited ? '#722ed1' : isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : theme.colorTextSecondary,
            }}
          />
          <Text weight={500}>Использование токенов</Text>
          {!isUnlimited && (
            <div
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 10,
                background: theme.colorFillSecondary,
                color: theme.colorTextSecondary,
                fontWeight: 'bold',
                border: `1px solid ${theme.colorBorder}`,
              }}
            >
              Партнёр
            </div>
          )}
        </Flexbox>
        {isUnlimited ? (
          <div
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
              color: '#fff',
              fontWeight: 'bold',
              boxShadow: '0 2px 4px rgba(114, 46, 209, 0.2)',
            }}
          >
            Безлимит
          </div>
        ) : (
          <Text style={{ fontSize: 12 }} type="secondary">
            {tokensUsed.toLocaleString()} / {tokenQuota.toLocaleString()}
          </Text>
        )}
      </Flexbox>

      {!isUnlimited && (
        <Progress
          percent={usagePercent}
          showInfo={false}
          strokeColor={isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : '#1890ff'}
          style={{ width: '100%', marginBottom: 0 }}
          railColor={theme.colorFillTertiary}
        />
      )}

      <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
        <Text style={{ fontSize: 12 }} type="secondary">
          {isUnlimited ? 'Использовано токенов' : 'Осталось токенов'}
        </Text>
        <Text
          weight={500}
          style={{
            fontSize: 14,
            color: isUnlimited ? undefined : isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : undefined,
          }}
        >
          {isUnlimited ? tokensUsed.toLocaleString() : displayRemaining.toLocaleString()}
        </Text>
      </Flexbox>
    </Flexbox>
  );
});

export default TokenLimits;
