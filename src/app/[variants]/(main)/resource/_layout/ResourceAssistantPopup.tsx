'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Modal, Typography } from 'antd';
import { memo, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const { Paragraph, Text, Title } = Typography;

const STORAGE_KEY = 'resourceAssistantPopupLastDay';
const FORCE_SHOW_PARAM = 'showResourceAssistant';

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ResourceAssistantPopup = memo(() => {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const forceShow = searchParams?.get(FORCE_SHOW_PARAM) === '1';

  useEffect(() => {
    if (forceShow) {
      const t = window.setTimeout(() => setOpen(true), 400);
      return () => window.clearTimeout(t);
    }
    if (typeof localStorage === 'undefined') return;

    const today = getTodayKey();
    if (localStorage.getItem(STORAGE_KEY) === today) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      localStorage.setItem(STORAGE_KEY, today);
      setOpen(true);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [forceShow]);

  const handleClose = () => setOpen(false);

  return (
    <Modal
      centered
      closable
      footer={null}
      mask={{ closable: true }}
      onCancel={handleClose}
      open={open}
      styles={{ body: { padding: '24px' } }}
      width={600}
    >
      <Flexbox horizontal align="stretch" gap={24}>
        {/* Левая колонка: большая картинка */}
        <div
          style={{
            borderRadius: 12,
            flexShrink: 0,
            height: 320,
            overflow: 'hidden',
            width: 220,
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
              color: '#333',
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
