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
    keepPreviousData: true,
  });

  if (error || (!data && !isLoading)) {
    return null;
  }

  const { tokenQuota = 0, tokensUsed = 0, remaining = 0 } = data || {};
  
  const displayRemaining = Math.max(0, remaining);
  const displayTokensUsed = Math.min(tokensUsed, tokenQuota);
  
  const usagePercent = tokenQuota > 0 ? Math.round((displayTokensUsed / tokenQuota) * 100) : 0;
  const isLow = displayRemaining < tokenQuota * 0.2;
  const isCritical = displayRemaining < tokenQuota * 0.1;
  const isUnlimited = tokenQuota >= 100_000_000;

  return (
    <StatisticCard
      loading={isLoading && !data}
      title={isUnlimited ? t('usage.cards.remaining.used') : (
        <Flexbox horizontal align="center" gap={8}>
          {t('usage.cards.remaining.title')}
          <div
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 10,
              background: 'rgba(0, 0, 0, 0.06)',
              color: 'rgba(0, 0, 0, 0.45)',
              fontWeight: 'bold',
              border: `1px solid rgba(0, 0, 0, 0.1)`,
            }}
          >
            Партнёр
          </div>
        </Flexbox>
      )}
      statistic={{
        value: isUnlimited ? tokensUsed.toLocaleString() : displayRemaining.toLocaleString(),
        description: (
          <Flexbox gap={8} style={{ width: '100%' }}>
            {!isUnlimited && (
              <Statistic
                title={t('usage.cards.remaining.used')}
                value={`${tokensUsed.toLocaleString()} / ${tokenQuota.toLocaleString()}`}
              />
            )}
            {isUnlimited && (
              <div
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
                  color: '#fff',
                  fontWeight: 'bold',
                  display: 'inline-block',
                  width: 'fit-content',
                  boxShadow: '0 2px 4px rgba(114, 46, 209, 0.2)',
                }}
              >
                Безлимит
              </div>
            )}
            {!isUnlimited && tokenQuota > 0 && (
              <Progress
                percent={usagePercent}
                showInfo={false}
                size="small"
                strokeColor={isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : '#1890ff'}
                railColor="rgba(0, 0, 0, 0.06)"
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
