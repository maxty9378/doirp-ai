'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { HardDriveIcon } from 'lucide-react';
import { memo } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

const StorageUsage = memo(() => {
  const { data, isLoading, error } = useSWR(
    'resource.storageUsage',
    () => lambdaClient.file.getStorageUsage.query(),
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    },
  );

  if (error || isLoading) return null;
  const usedBytes = data?.usedBytes ?? 0;

  return (
    <Flexbox horizontal align="center" gap={6} style={{ flexShrink: 0 }}>
      <HardDriveIcon size={16} style={{ opacity: 0.7 }} />
      <Text style={{ fontSize: 13 }} type="secondary">
        Занято: {formatBytes(usedBytes)}
      </Text>
    </Flexbox>
  );
});

StorageUsage.displayName = 'StorageUsage';

export default StorageUsage;
