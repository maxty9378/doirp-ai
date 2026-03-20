'use client';

import { ActionIcon, Flexbox, ScrollShadow } from '@lobehub/ui';
import { Button, Input, message as antdMessage, Typography } from 'antd';
import { Bot, PanelRightClose, Send } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

const { Title, Text } = Typography;
const { TextArea } = Input;

const getApiUrl = (path: string) => {
  if (typeof window === 'undefined') return path;
  const fallbackBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010';
  const base = window.location.origin?.startsWith('http') ? window.location.origin : fallbackBase;
  return `${base}${path}`;
};

export interface Message {
  buttons?: { id: string; label: string }[];
  id: string;
  role: 'user' | 'bot';
  text: string;
}

interface SimulatorProps {
  onClose: () => void;
  open: boolean;
}

const Simulator = memo<SimulatorProps>(({ open, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState<string>('start');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Когда симулятор открывается, отправляем скрытый стартовый триггер
  useEffect(() => {
    if (open && messages.length === 0) {
      sendMessage('start_conversation', true);
    }
  }, [open, messages.length]);

  // Автоскролл вниз
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string, isSilentTrigger = false) => {
    if (!text.trim()) return;

    if (!isSilentTrigger) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          text,
        },
      ]);
    }
    setInputValue('');
    setLoading(true);

    try {
      const res = await fetch(getApiUrl('/api/max/webhook'), {
        body: JSON.stringify({
          context: { current_node_id: currentNodeId },
          from_user_id: 'simulator_user',
          text,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = await res.json();
      if (data.status === 'ok' && data.response) {
        setMessages((prev) => [
          ...prev,
          {
            buttons: data.response.buttons,
            id: Date.now().toString(),
            role: 'bot',
            text: data.response.text,
          },
        ]);
        if (data.response.nodeId) {
          setCurrentNodeId(data.response.nodeId);
        }
      } else {
        antdMessage.error('Ошибка обработки в симуляторе');
      }
    } catch (e) {
      antdMessage.error('Сетевая ошибка симулятора');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Flexbox
      style={{
        background: 'var(--colorBgLayout)',
        borderLeft: '1px solid var(--colorBorder)',
        height: '100%',
        width: 350,
        zIndex: 10,
      }}
    >
      {/* Header */}
      <Flexbox
        horizontal
        align="center"
        justify="space-between"
        padding={16}
        style={{ borderBottom: '1px solid var(--colorBorder)' }}
      >
        <Flexbox horizontal align="center" gap={8}>
          <Bot size={18} />
          <Title level={5} style={{ margin: 0 }}>
            Чат-тестер
          </Title>
        </Flexbox>
        <ActionIcon icon={PanelRightClose} onClick={onClose} />
      </Flexbox>

      {/* Messages */}
      <ScrollShadow ref={scrollRef} style={{ flex: 1, padding: '16px 0' }}>
        <Flexbox gap={24} paddingInline={16}>
          {messages.map((msg) => (
            <Flexbox
              align={msg.role === 'user' ? 'flex-end' : 'flex-start'}
              gap={8}
              key={msg.id}
              style={{ width: '100%' }}
            >
              <Flexbox
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  background:
                    msg.role === 'user' ? 'var(--colorSuccessBg)' : 'var(--colorBgContainer)',
                  border: '1px solid var(--colorBorder)',
                  borderRadius: 12,
                  maxWidth: '85%',
                  padding: '8px 12px',
                }}
              >
                <Text style={{ marginBottom: 2 }} type="secondary">
                  {msg.role === 'user' ? 'Вы' : 'Бот'}
                </Text>
                <Text>{msg.text}</Text>
              </Flexbox>

              {msg.buttons && msg.buttons.length > 0 && (
                <Flexbox horizontal gap={8} style={{ marginLeft: msg.role === 'bot' ? 48 : 0 }}>
                  {msg.buttons.map((btn) => (
                    <Button
                      key={btn.id}
                      size="small"
                      type="primary"
                      onClick={() => sendMessage(btn.label)}
                    >
                      {btn.label}
                    </Button>
                  ))}
                </Flexbox>
              )}
            </Flexbox>
          ))}
          {loading && (
            <Flexbox style={{ marginLeft: 48, marginTop: 8 }}>
              <Text type="secondary">Бот печатает...</Text>
            </Flexbox>
          )}
        </Flexbox>
      </ScrollShadow>

      {/* Input */}
      <Flexbox padding={16} style={{ borderTop: '1px solid var(--colorBorder)' }}>
        <Flexbox gap={12}>
          <TextArea
            autoSize={{ maxRows: 6, minRows: 2 }}
            placeholder="Введите сообщение..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                sendMessage(inputValue);
              }
            }}
          />
          <Flexbox justify="flex-end" width="100%">
            <Button
              icon={<Send size={14} />}
              loading={loading}
              type="primary"
              onClick={() => sendMessage(inputValue)}
            >
              Отправить
            </Button>
          </Flexbox>
        </Flexbox>
      </Flexbox>
    </Flexbox>
  );
});

export default Simulator;
