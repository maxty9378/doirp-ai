'use client';

import { ActionIcon, Flexbox, Icon, Text } from '@lobehub/ui';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ArchiveIcon, FileTextIcon, RotateCcwIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { usePageStore } from '@/store/page';
import type { LobeDocument } from '@/types/document';

dayjs.extend(relativeTime);

const ArchiveList = memo(() => {
  const { t } = useTranslation('file');
  const [loading, setLoading] = useState(true);

  const [deletedDocuments, fetchDeletedDocuments, restorePage] = usePageStore((s) => [
    s.deletedDocuments ?? [],
    s.fetchDeletedDocuments,
    s.restorePage,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDeletedDocuments().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchDeletedDocuments]);

  if (loading) {
    return <SkeletonList rows={3} />;
  }

  if (deletedDocuments.length === 0) {
    return (
      <Flexbox gap={4} paddingBlock={8} paddingInline={4}>
        <Icon icon={ArchiveIcon} size={{ size: 24 }} style={{ opacity: 0.5 }} />
        <Text style={{ fontSize: 12 }} type="secondary">
          {t('pageList.archiveEmpty')}
        </Text>
      </Flexbox>
    );
  }

  return (
    <Flexbox gap={1} paddingBlock={1}>
      {deletedDocuments.map((doc: LobeDocument & { deletedAt?: Date | string | null }) => (
        <ArchiveItem
          deletedAt={doc.deletedAt}
          key={doc.id}
          title={doc.title ?? doc.filename ?? t('pageList.untitled')}
          onRestore={() => restorePage(doc.id)}
        />
      ))}
    </Flexbox>
  );
});

ArchiveList.displayName = 'ArchiveList';

interface ArchiveItemProps {
  deletedAt?: Date | string | null;
  onRestore: () => void;
  title: string;
}

const ArchiveItem = memo<ArchiveItemProps>(({ title, deletedAt, onRestore }) => {
  const { t } = useTranslation('file');
  const timeStr =
    deletedAt != null
      ? t('pageList.deletedAt', {
          time: dayjs(deletedAt).fromNow(),
        })
      : null;
  const displayTitle = timeStr ? `${title} · ${timeStr}` : title;

  return (
    <NavItem
      actions={
        <ActionIcon
          aria-label={t('pageList.restore')}
          icon={RotateCcwIcon}
          size="small"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRestore();
          }}
        />
      }
      icon={FileTextIcon}
      title={displayTitle}
    />
  );
});

ArchiveItem.displayName = 'ArchiveItem';

export default ArchiveList;
