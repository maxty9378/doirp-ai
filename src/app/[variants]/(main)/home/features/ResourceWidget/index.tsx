'use client';

import { Flexbox, Icon, Skeleton, Text } from '@lobehub/ui';
import { Progress } from 'antd';
import { useTheme } from 'antd-style';
import { ImageIcon, Zap } from 'lucide-react';
import { memo } from 'react';
import useSWR from 'swr';

/** 1 credit = 10 tokens (ОДО) */
const TOKENS_PER_CREDIT = 10;

interface ResourceLimitsData {
  dailyImageCount: number;
  imageLimit: number;
  remaining: number;
  tokenQuota: number;
  tokensUsed: number;
}

const fetcher = async (url: string): Promise<ResourceLimitsData> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch resource limits');
  return res.json();
};

const ResourceWidget = memo(() => {
  const theme = useTheme();
  const { data, error, isLoading } = useSWR<ResourceLimitsData>('/api/user/token-limits', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  if (isLoading && !data) {
    return (
      <Flexbox gap={12} style={{ width: '100%', padding: '4px 0' }}>
        <Flexbox gap={6} style={{ width: '100%' }}>
          <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
            <Skeleton.Button active size="small" style={{ width: 100, height: 20 }} />
            <Skeleton.Button active size="small" style={{ width: 60, height: 20 }} />
          </Flexbox>
          <Skeleton.Button active size="small" style={{ width: '100%', height: 8, borderRadius: 4 }} />
          <Skeleton.Button active size="small" style={{ width: 120, height: 16 }} />
        </Flexbox>
        <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
          <Skeleton.Button active size="small" style={{ width: 140, height: 20 }} />
          <Skeleton.Button active size="small" style={{ width: 60, height: 20 }} />
        </Flexbox>
      </Flexbox>
    );
  }

  if (error || !data) {
    return null;
  }

  const { tokenQuota, tokensUsed, remaining, dailyImageCount, imageLimit } = data;
  
  // Prevent negative remaining balance if user goes into overdraft
  const displayRemaining = Math.max(0, remaining);
  const displayTokensUsed = Math.min(tokensUsed, tokenQuota);
  
  const creditsRemaining = Math.floor(displayRemaining / TOKENS_PER_CREDIT);
  const creditsQuota = Math.floor(tokenQuota / TOKENS_PER_CREDIT);
  
  const usagePercent = tokenQuota > 0 ? Math.round((displayTokensUsed / tokenQuota) * 100) : 0;
  const remainingPercent = tokenQuota > 0 ? Math.round((displayRemaining / tokenQuota) * 100) : 100;
  const isLow = remainingPercent < 20;
  const isCritical = remainingPercent < 10;
  const isUnlimited = tokenQuota >= 100_000_000;

  return (
    <Flexbox gap={12} style={{ width: '100%' }}>
      {/* Учебные кредиты (текстовый баланс) */}
      <Flexbox gap={6} style={{ width: '100%' }}>
        <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
          <Flexbox horizontal align="center" gap={8}>
            <Icon
              icon={Zap}
              size={14}
              style={{
                color: isUnlimited ? '#722ed1' : isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : theme.colorTextSecondary,
              }}
            />
            <Text weight={500}>Учебные кредиты</Text>
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
            <Text
              style={{ fontSize: 12 }}
              title="Остаток / лимит (кредитов, 1 кр. = 10 токенов)"
              type="secondary"
            >
              {creditsRemaining.toLocaleString()} / {creditsQuota.toLocaleString()} кр.
            </Text>
          )}
        </Flexbox>
        {!isUnlimited && (
          <Progress
            percent={usagePercent}
            railColor={theme.colorFillTertiary}
            showInfo={false}
            strokeColor={isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : '#1890ff'}
            style={{ width: '100%', marginBottom: 0 }}
          />
        )}
        <Text style={{ fontSize: 11 }} type="secondary">
          использовано {Math.floor(tokensUsed / TOKENS_PER_CREDIT).toLocaleString()} кр. (1 кр. = 10
          токенов)
        </Text>
      </Flexbox>

      {/* Креативный фокус: генерации изображений сегодня */}
      <Flexbox horizontal align="center" justify="space-between" style={{ width: '100%' }}>
        <Flexbox horizontal align="center" gap={8}>
          <Icon icon={ImageIcon} size={14} style={{ color: theme.colorTextSecondary }} />
          <Text style={{ fontSize: 13 }} type="secondary">
            Использовано генераций:
          </Text>
        </Flexbox>
        <Text style={{ fontSize: 13 }} weight={500} type={dailyImageCount >= imageLimit ? 'danger' : undefined}>
          {dailyImageCount}/{imageLimit} сегодня
        </Text>
      </Flexbox>
    </Flexbox>
  );
});

ResourceWidget.displayName = 'ResourceWidget';

export default ResourceWidget;
