'use client';

import { Flexbox } from '@lobehub/ui';
import { Progress } from 'antd';
import { memo } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';

import Statistic from '@/components/Statistic';
import StatisticCard from '@/components/StatisticCard';

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

const RemainingLimit = memo(() => {
  const { t } = useTranslation('auth');
  const { data, isLoading, error } = useSWR<TokenLimitsData>('/api/user/token-limits', fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  });

  if (error || !data) {
    return null;
  }

  const { tokenQuota, tokensUsed, remaining } = data;
  const usagePercent = tokenQuota > 0 ? Math.round((tokensUsed / tokenQuota) * 100) : 0;
  const isLow = remaining < tokenQuota * 0.2;
  const isCritical = remaining < tokenQuota * 0.1;

  return (
    <StatisticCard
      loading={isLoading}
      title={t('usage.cards.remaining.title')}
      statistic={{
        value: remaining.toLocaleString(),
        description: (
          <Flexbox gap={8} style={{ width: '100%' }}>
            <Statistic
              title={t('usage.cards.remaining.used')}
              value={`${tokensUsed.toLocaleString()} / ${tokenQuota.toLocaleString()}`}
            />
            {tokenQuota > 0 && (
              <Progress
                percent={usagePercent}
                showInfo={false}
                size="small"
                strokeColor={isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : '#1890ff'}
                trailColor="rgba(0, 0, 0, 0.06)"
              />
            )}
          </Flexbox>
        ),
      }}
    />
  );
});

RemainingLimit.displayName = 'RemainingLimit';

export default RemainingLimit;
