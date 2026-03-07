'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Modal, Typography } from 'antd';
import { memo, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { lambdaClient } from '@/libs/trpc/client';

const { Paragraph, Text, Title } = Typography;

const STORAGE_KEY_FIRST_SEEN = 'resourceAssistantPopupFirstSeen';
const FORCE_SHOW_PARAM = 'showResourceAssistant';
const STORAGE_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 МБ

const ResourceAssistantPopup = memo(() => {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  const forceShow = searchParams?.get(FORCE_SHOW_PARAM) === '1';

  useEffect(() => {
    if (forceShow) {
      const t = window.setTimeout(() => setOpen(true), 400);
      return () => window.clearTimeout(t);
    }

    let cancelled = false;

    const run = async () => {
      try {
        const { usedBytes: bytes } = await lambdaClient.file.getStorageUsage.query();
        if (cancelled) return;
        setUsedBytes(bytes ?? 0);
      } catch {
        if (cancelled) return;
        setUsedBytes(0);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [forceShow]);

  useEffect(() => {
    if (forceShow || usedBytes === null) return;
    if (typeof localStorage === 'undefined') return;

    const firstSeen = localStorage.getItem(STORAGE_KEY_FIRST_SEEN) === '1';
    const overThreshold = usedBytes > STORAGE_THRESHOLD_BYTES;

    if (firstSeen && !overThreshold) return;

    const t = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(t);
  }, [forceShow, usedBytes]);

  const handleClose = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_FIRST_SEEN, '1');
    }
    setOpen(false);
  };

  return (
    <Modal
      centered
      closable
      footer={null}
      mask={{ closable: true }}
      onCancel={handleClose}
      open={open}
      styles={{ body: { padding: '24px' } }}
      width={720}
    >
      <Flexbox horizontal align="stretch" gap={24}>
        {/* Левая колонка: большая картинка */}
        <div
          style={{
            borderRadius: 12,
            flexShrink: 0,
            height: 300,
            overflow: 'hidden',
            width: 300,
          }}
        >
          <img
            alt="Макс"
            src="/images/assistant-max.jpg"
            style={{
              display: 'block',
              height: '100%',
              objectFit: 'cover',
              width: '100%',
            }}
          />
        </div>

        {/* Правая колонка: текст обращения */}
        <Flexbox gap={8} justify="center" style={{ flex: 1, minWidth: 0, padding: '12px 0' }}>
          <div style={{ marginBottom: 8 }}>
            <Title level={4} style={{ margin: 0, fontWeight: 600 }}>
              Макс
            </Title>
            <Text style={{ fontSize: '14px' }} type="secondary">
              Ресурсный менеджер
            </Text>
          </div>
          <Paragraph
            style={{
              color: '#fff',
              fontSize: '15px',
              lineHeight: '1.6',
              marginBottom: '24px',
            }}
          >
            Привет! 👋 Наша система работает стабильно и быстро, когда мы
            бережно относимся к ресурсам.
            <br />
            <br />
            Пожалуйста, следите за местом на диске: вовремя удаляйте тяжёлые
            файлы и старые генерации, которые вам больше не нужны. Это поможет
            платформе работать без перебоев для всех!
          </Paragraph>
          <Flexbox horizontal justify="flex-end">
            <Button
              size="large"
              style={{ borderRadius: 8, fontWeight: 500 }}
              type="primary"
              onClick={handleClose}
            >
              Понял, буду экономить!
            </Button>
          </Flexbox>
        </Flexbox>
      </Flexbox>
    </Modal>
  );
});

ResourceAssistantPopup.displayName = 'ResourceAssistantPopup';

export default ResourceAssistantPopup;
