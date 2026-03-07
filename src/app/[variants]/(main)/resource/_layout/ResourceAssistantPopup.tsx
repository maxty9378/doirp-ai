'use client';

import { Flexbox } from '@lobehub/ui';
import { Avatar, Button, Modal, Typography } from 'antd';
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
      styles={{ body: { padding: '24px 12px' } }}
      width={520}
    >
      <Flexbox horizontal align="flex-start" gap={24}>
        <Avatar
          src="/images/assistant-max.jpg"
          size={110}
          style={{
            border: '2px solid #f0f0f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            flexShrink: 0,
          }}
        />
        <Flexbox gap={8} style={{ flex: 1, minWidth: 0 }}>
          <div>
            <Title level={4} style={{ margin: 0, fontWeight: 600 }}>
              Максим Кадочкин
            </Title>
            <Text style={{ fontSize: '13px' }} type="secondary">
              Отдел Дистанционного обучения
            </Text>
          </div>
          <Paragraph
            style={{
              color: '#333',
              fontSize: '15px',
              lineHeight: '1.6',
              marginBottom: '16px',
              marginTop: '8px',
            }}
          >
            Привет! 👋 Я собрал эту ИИ-среду, чтобы забрать у вас часть рутины.
            <br />
            <br />
            Здесь мы можем быстро собирать фактуру для слайдов, генерировать
            ролевые кейсы для тренингов и проверять задания стажеров. Если
            что-то пойдёт не так — пишите мне напрямую!
          </Paragraph>
          <Flexbox horizontal justify="flex-end">
            <Button
              size="large"
              style={{ borderRadius: 8, fontWeight: 500 }}
              type="primary"
              onClick={handleClose}
            >
              Отлично, к делу!
            </Button>
          </Flexbox>
        </Flexbox>
      </Flexbox>
    </Modal>
  );
});

ResourceAssistantPopup.displayName = 'ResourceAssistantPopup';

export default ResourceAssistantPopup;
