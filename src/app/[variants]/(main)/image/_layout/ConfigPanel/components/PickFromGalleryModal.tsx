'use client';

import { Button, Modal, Tabs } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { FilesTabs } from '@lobechat/types';
import { Check } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import ImageItem from '@/components/ImageItem';
import { lambdaClient } from '@/libs/trpc/client';
import { useImageStore } from '@/store/image';

const styles = createStaticStyles(({ css, cssVar }) => ({
  grid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
    max-height: 360px;
    overflow-y: auto;
    padding: 8px 0;
  `,
  item: css`
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s, box-shadow 0.2s;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
      box-shadow: 0 0 0 1px ${cssVar.colorPrimary};
    }

    &.selected {
      border-color: ${cssVar.colorPrimary};
      box-shadow: 0 0 0 2px ${cssVar.colorPrimary};
    }
  `,
  check: css`
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: ${cssVar.colorPrimary};
    color: ${cssVar.colorTextLightSolid};
    display: flex;
    align-items: center;
    justify-content: center;
  `,
}));

interface PickFromGalleryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (urls: string[]) => void;
  currentUrls?: string[];
  maxCount?: number;
}

export const PickFromGalleryModal = memo<PickFromGalleryModalProps>(
  ({ open, onClose, onSelect, currentUrls = [], maxCount = 4 }) => {
    const { t } = useTranslation('image');
    const generationBatchesMap = useImageStore((s) => s.generationBatchesMap);
    const [activeTab, setActiveTab] = useState<string>('generated');

    const { data: uploadedFiles = [] } = useSWR(
      open ? ['file.getFiles.images', open] : null,
      async () =>
        lambdaClient.file.getFiles.query({
          category: FilesTabs.Images,
          limit: 200,
        }),
    );

    const generatedUrls = useMemo(() => {
      const urls: string[] = [];
      const allBatches = Object.values(generationBatchesMap).flat();
      for (const batch of allBatches) {
        for (const gen of batch.generations) {
          const url = (gen as { asset?: { url?: string } }).asset?.url;
          if (url && !urls.includes(url)) urls.push(url);
        }
      }
      return urls;
    }, [generationBatchesMap]);

    const uploadedUrls = useMemo(() => {
      return uploadedFiles.map((f) => f.url).filter(Boolean) as string[];
    }, [uploadedFiles]);

    const [selected, setSelected] = useState<Set<string>>(() => new Set());

    const existingSet = useMemo(() => new Set(currentUrls), [currentUrls]);

    const selectableGenerated = useMemo(
      () => generatedUrls.filter((url) => !existingSet.has(url)),
      [generatedUrls, existingSet],
    );
    const selectableUploaded = useMemo(
      () => uploadedUrls.filter((url) => !existingSet.has(url)),
      [uploadedUrls, existingSet],
    );

    const toggle = (url: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(url)) next.delete(url);
        else if (next.size + currentUrls.length < maxCount) next.add(url);
        return next;
      });
    };

    const handleConfirm = () => {
      onSelect([...currentUrls, ...selected]);
      setSelected(new Set());
      onClose();
    };

    const handleCancel = () => {
      setSelected(new Set());
      onClose();
    };

    const renderGrid = (urls: string[]) => {
      if (urls.length === 0) return null;
      return (
        <div className={styles.grid}>
          {urls.map((url) => {
            const isSelected = selected.has(url);
            return (
              <div
                key={url}
                className={`${styles.item} ${isSelected ? 'selected' : ''}`}
                onClick={() => toggle(url)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(url);
                  }
                }}
              >
                <ImageItem
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  url={url}
                  preview={{ src: url }}
                />
                {isSelected && (
                  <div className={styles.check}>
                    <Check size={12} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    const hasAnySelectable = selectableGenerated.length > 0 || selectableUploaded.length > 0;

    return (
      <Modal
        open={open}
        onCancel={handleCancel}
        title={t('config.pickFromGallery.title')}
        footer={
          <>
            <Button onClick={handleCancel}>{t('config.pickFromGallery.cancel')}</Button>
            <Button disabled={selected.size === 0} onClick={handleConfirm} type="primary">
              {t('config.pickFromGallery.confirm')} {selected.size > 0 && `(${selected.size})`}
            </Button>
          </>
        }
      >
        <Tabs
          activeKey={activeTab}
          items={[
            {
              children: selectableGenerated.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--colorTextSecondary)' }}>
                  {t('config.pickFromGallery.emptyGenerated')}
                </div>
              ) : (
                renderGrid(selectableGenerated)
              ),
              key: 'generated',
              label: t('config.pickFromGallery.tabGenerated'),
            },
            {
              children: selectableUploaded.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--colorTextSecondary)' }}>
                  {t('config.pickFromGallery.emptyUploaded')}
                </div>
              ) : (
                renderGrid(selectableUploaded)
              ),
              key: 'uploaded',
              label: t('config.pickFromGallery.tabUploaded'),
            },
          ]}
          onChange={setActiveTab}
        />
        {hasAnySelectable && (
          <p style={{ fontSize: 12, color: 'var(--colorTextSecondary)', marginTop: 8 }}>
            {t('config.pickFromGallery.hint', { max: maxCount - currentUrls.length })}
          </p>
        )}
      </Modal>
    );
  },
);

PickFromGalleryModal.displayName = 'PickFromGalleryModal';
