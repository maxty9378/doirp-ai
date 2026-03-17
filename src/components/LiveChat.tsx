'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createStyles } from 'antd-style';

export interface LiveChatProps {
  score: number;
  /** Время (timestamp) после которого можно показывать сообщения. Если null — показ сразу. */
  showMessagesAfterTs?: number | null;
}

interface ChatMessage {
  id: string;
  author: string;
  text: string;
  type: 'neutral' | 'positive' | 'negative';
}

const AUTHORS = [
  'Alex_Pro',
  'Dmitriy99',
  'Katerina_V',
  'SmmGuru',
  'OlegT',
  'Elena_Marketer',
  'Igor_B',
  'Anna_K',
  'Max_Power',
  'Julia_S',
  'CryptoBro',
  'Z_User',
  'MemeLord',
  'FoodBlogger',
];

const PHRASES_POSITIVE = [
  'А он неплохо держится! 🔥',
  'Грамотно отработал возражение',
  'Собчак бы уже его съела, а этот молодец',
  'База! Все по факту',
  'Хороший аргумент про маржу 📈',
  'Давай, дожимай её!',
  'Куплю ваш энергетик завтра',
  'Вот это я понимаю, профи 😎',
];

const PHRASES_NEGATIVE = [
  'Лол, он вообще методичку читал? 🤦‍♂️',
  'Вода водой...',
  'Сливается на простых вопросах',
  'Кринж...',
  'Почему он заикается? 😂',
  'Да ответь ты прямо про сахар!',
  'Кошмар, кого они наняли',
  'Скуууучно 🥱',
  'Закапывает сам себя',
];

const PHRASES_NEUTRAL = [
  'А сколько стоит этот лимонад?',
  'Опять реклама энергетиков',
  'Что за выставка?',
  'Кто-нибудь пробовал этот вкус?',
  'Привет из Воронежа 👋',
  'Звук норм?',
  'Интересная дискуссия',
];

const useStyles = createStyles(({ css }) => ({
  root: css`
    width: 100%;
    height: 260px;
    border-radius: 16px;
    border: 1px solid rgba(55, 65, 81, 0.7);
    background: rgba(15, 23, 42, 0.86);
    backdrop-filter: blur(12px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: rgba(31, 41, 55, 0.95);
    border-bottom: 1px solid rgba(55, 65, 81, 0.8);
  `,
  headerTitle: css`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #e5e7eb;
  `,
  pulseDot: css`
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #ef4444;
    box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.7);
    animation: livePulse 1.4s ease-out infinite;

    @keyframes livePulse {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      70% {
        transform: scale(1.6);
        opacity: 0;
      }
      100% {
        transform: scale(1);
        opacity: 0;
      }
    }
  `,
  viewers: css`
    font-size: 11px;
    color: #6b7280;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  `,
  list: css`
    flex: 1;
    overflow-y: auto;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  `,
  message: css`
    font-size: 13px;
    line-height: 1.4;
    color: #e5e7eb;
    opacity: 0;
    transform: translateY(6px);
    animation: fadeInUp 0.25s ease-out forwards;

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
  author: css`
    font-weight: 600;
    margin-right: 6px;
  `,
  authorPositive: css`
    color: #34d399;
  `,
  authorNegative: css`
    color: #f97373;
  `,
  authorNeutral: css`
    color: #818cf8;
  `,
  text: css`
    color: #e5e7eb;
  `,
}));

export function LiveChat({ score, showMessagesAfterTs = null }: LiveChatProps) {
  const { styles, cx } = useStyles();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [canShowMessages, setCanShowMessages] = useState(!showMessagesAfterTs);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Включить вывод сообщений через 10 секунд после подключения ИИ (когда showMessagesAfterTs в прошлом).
  useEffect(() => {
    if (showMessagesAfterTs == null) {
      setCanShowMessages(true);
      return;
    }
    const id = setInterval(() => {
      if (Date.now() >= showMessagesAfterTs) setCanShowMessages(true);
    }, 1000);
    return () => clearInterval(id);
  }, [showMessagesAfterTs]);

  useEffect(() => {
    if (!canShowMessages) return;
    const generateMessage = () => {
      const isPositiveScore = score >= 5;
      const isNegativeScore = score <= -5;

      let type: 'neutral' | 'positive' | 'negative' = 'neutral';
      let pool = PHRASES_NEUTRAL;

      const rand = Math.random();
      if (isNegativeScore) {
        if (rand < 0.7) {
          type = 'negative';
          pool = PHRASES_NEGATIVE;
        } else if (rand < 0.9) {
          type = 'neutral';
          pool = PHRASES_NEUTRAL;
        } else {
          type = 'positive';
          pool = PHRASES_POSITIVE;
        }
      } else if (isPositiveScore) {
        if (rand < 0.7) {
          type = 'positive';
          pool = PHRASES_POSITIVE;
        } else if (rand < 0.9) {
          type = 'neutral';
          pool = PHRASES_NEUTRAL;
        } else {
          type = 'negative';
          pool = PHRASES_NEGATIVE;
        }
      } else {
        if (rand < 0.33) {
          type = 'positive';
          pool = PHRASES_POSITIVE;
        } else if (rand < 0.66) {
          type = 'negative';
          pool = PHRASES_NEGATIVE;
        }
      }

      const text = pool[Math.floor(Math.random() * pool.length)];
      const author = AUTHORS[Math.floor(Math.random() * AUTHORS.length)];

      const newMessage: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        author,
        text,
        type,
      };

      setMessages((prev) => {
        const next = [...prev, newMessage];
        return next.length <= 4 ? next : next.slice(-4);
      });
    };

    const intervalMs = Math.random() * 2500 + 1500;
    const interval = setInterval(generateMessage, intervalMs);
    return () => clearInterval(interval);
  }, [canShowMessages, score]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.pulseDot} />
          <span>Live чат зрителей</span>
        </div>
        <span className={styles.viewers}>
          {Math.floor(Math.random() * 1000 + 500)} viewers
        </span>
      </div>

      <div className={styles.list}>
        {messages.map((msg) => (
          <div key={msg.id} className={styles.message}>
            <span
              className={cx(
                styles.author,
                msg.type === 'positive'
                  ? styles.authorPositive
                  : msg.type === 'negative'
                  ? styles.authorNegative
                  : styles.authorNeutral,
              )}
            >
              {msg.author}:
            </span>
            <span className={styles.text}>{msg.text}</span>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}


