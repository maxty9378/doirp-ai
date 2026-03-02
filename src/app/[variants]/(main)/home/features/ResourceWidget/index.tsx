'use client';

import { Flexbox, Icon, Skeleton, Text } from '@lobehub/ui';
import { useTheme } from 'antd-style';
import { Progress } from 'antd';
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
  const { data, error, isLoading } = useSWR<ResourceLimitsData>(
    '/api/user/token-limits',
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
    },
  );

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

  const { tokenQuota, tokensUsed, remaining, dailyImageCount, imageLimit } = data;
  const creditsRemaining = Math.floor(remaining / TOKENS_PER_CREDIT);
  const creditsQuota = Math.floor(tokenQuota / TOKENS_PER_CREDIT);
  const usagePercent = tokenQuota > 0 ? Math.round((tokensUsed / tokenQuota) * 100) : 0;
  const remainingPercent = tokenQuota > 0 ? Math.round((remaining / tokenQuota) * 100) : 100;
  const isLow = remainingPercent < 20;
  const isCritical = remainingPercent < 10;

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
                color: isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : theme.colorTextSecondary,
              }}
            />
            <Text weight={500}>Учебные кредиты</Text>
          </Flexbox>
          <Text style={{ fontSize: 12 }} type="secondary" title="Остаток / лимит (кредитов, 1 кр. = 10 токенов)">
            {creditsRemaining.toLocaleString()} / {creditsQuota.toLocaleString()} кр.
          </Text>
        </Flexbox>
        <Progress
          percent={usagePercent}
          showInfo={false}
          strokeColor={isCritical ? '#ff4d4f' : isLow ? '#ffa34d' : '#1890ff'}
          style={{ width: '100%', marginBottom: 0 }}
          railColor={theme.colorFillTertiary}
        />
        <Text style={{ fontSize: 11 }} type="tertiary">
          использовано {Math.floor(tokensUsed / TOKENS_PER_CREDIT).toLocaleString()} кр. (1 кр. = 10 токенов)
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
        <Text style={{ fontSize: 13 }} weight={500}>
          {dailyImageCount}/{imageLimit} сегодня
        </Text>
      </Flexbox>
    </Flexbox>
  );
});

ResourceWidget.displayName = 'ResourceWidget';

export default ResourceWidget;
