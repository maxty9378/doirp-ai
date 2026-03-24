'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createStyles } from 'antd-style';

export interface LiveChatProps {
  score: number;
  showMessagesAfterTs?: number | null;
  mode?: 'default' | 'escape';
  fullHeight?: boolean;
  /** When embedded inside broadcast bar — no border/radius/header, fills container */
  embedded?: boolean;
}

interface ChatMessage {
  id: string;
  author: string;
  text: string;
  type: 'neutral' | 'positive' | 'negative';
}

const MAX_MESSAGES = 300;

const AUTHORS = [
  'Alex_Pro', 'Dmitriy99', 'Katerina_V', 'SmmGuru', 'OlegT', 'Elena_M',
  'Igor_B', 'Anna_K', 'Max_Power', 'Julia_S', 'CryptoBro', 'Z_User',
  'MemeLord', 'FoodBlogger', 'Stas_N', 'BeastMode', 'NightOwl', 'Nika_T',
  'User_404', 'Ivan_I', 'Super_Star', 'Leonid_V', 'Pavel_R', 'Dasha_01',
  'PR_Shark', 'MediaBoss', 'Oleg_SMM', 'Nastya_HR', 'Viktor_CEO',
  'Lena_Brand', 'Kirill_Dev', 'Masha_PR', 'Artem_Sales', 'Zhenya_Ads',
  'Sveta_Copy', 'Roma_Fin', 'Polina_UX', 'Grisha_AI', 'Tanya_SEO',
  'Andrey_CTO', 'Vika_Event', 'Kolya_Data', 'Ira_Strat', 'Denis_Ops',
  'Yulia_CM', 'Fedya_Hack', 'Alina_Prod', 'Borya_Inv', 'Katya_Mkt',
  'Sasha_Biz', 'Gleb_Tech', 'Anya_Lead', 'Petya_QA', 'Dima_Growth',
  'Liza_Comm', 'Kostya_BI', 'Vera_Sup', 'Timur_PM', 'Oksana_VP',
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
  'Красиво ушел от провокации',
  'Четко по фактам бьет',
  'Уверенный тон, молодец',
  'Вот так надо отвечать на прессинг',
  'Спокойствие — его суперсила',
  'Наконец-то нормальный спикер',
  'Класс, перехватил инициативу',
  'Он реально подготовился',
  'Сильный аргумент 💪',
  'Журналистка не ожидала такого ответа',
  'Респект за хладнокровие',
  'Вот это выдержка!',
  'Профессионал, сразу видно',
  'Ну наконец кто-то умеет говорить',
  'Браво, отличная подача',
  'Факты на стол — и тишина',
  'Это было мощно',
  'Уровень! 🏆',
  'Заткнул за пояс',
  'Вот бы все так умели',
  'Железные нервы',
  'Топ-ответ, запишу себе',
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
  'Это что, стажер?',
  'Мямлит что-то невнятное',
  'Ну всё, бренд похоронен',
  'Журналистка его размазала',
  'Ноль подготовки, ноль фактов',
  'Он вообще понимает о чем речь?',
  'Паника в глазах 😬',
  'Классический слив',
  'Даже мне стыдно за него',
  'Это провал на всех уровнях',
  'Кого пустили в эфир?',
  'Ответ уровня "ну, это сложный вопрос"',
  'Пустые слова, ноль конкретики',
  'Он же сам себе противоречит',
  'Журналистка его ест на завтрак',
  'Позорище 🤡',
  'Не спикер, а мишень',
  'Ой, больно смотреть',
  'Это антиреклама компании',
  'Провал за провалом',
  'Хуже некуда',
];

const PHRASES_NEUTRAL = [
  'А сколько стоит этот лимонад?',
  'Опять реклама энергетиков',
  'Что за выставка?',
  'Кто-нибудь пробовал этот вкус?',
  'Привет из Воронежа 👋',
  'Звук норм?',
  'Интересная дискуссия',
  'Кто этот журналист?',
  'Первый раз на таком стриме',
  'А это прямой эфир?',
  'Сколько зрителей?',
  'Тема актуальная на самом деле',
  'Ждем развязки',
  'Попкорн готов 🍿',
  'Интересно, чем закончится',
  'А где можно почитать подробнее?',
  'Норм формат, давайте еще',
  'Кто победит? Делаем ставки',
  'Это записывается?',
  'Подписался на канал',
  'Пишу диплом по этой теме',
  'А есть ссылка на исследование?',
  'Жду финала',
  'Кто-нибудь конспектирует?',
  'Тема огонь, но спорная',
  'Хм, интересный поворот',
  'Залетел с рекомендаций',
  'А что было до этого?',
  'Норм контент',
  'Лайк за формат',
];

const PHRASES_QUESTION = [
  'А что он имел в виду?',
  'Это правда про исследования?',
  'Кто-нибудь может объяснить?',
  'А какие данные он цитирует?',
  'Это же манипуляция, нет?',
  'А есть пруфы?',
  'Откуда такая статистика?',
  'Серьезно? Не верю',
  'А что думаете?',
  'Это законно вообще?',
];

const PHRASES_MEME = [
  'Это фиаско, братан',
  'Ну всё, расходимся',
  'F в чат',
  'Ctrl+Z его ответ',
  'Нажми Alt+F4',
  'Кто-нибудь вызовите скорую',
  'Больно, но справедливо',
  'Ситуация: 📉📉📉',
  'Ладно, я пошел спать',
  'Это мем года',
];

const ESCAPE_DIRECT = [
  'Слился)', 'Ливнул...', 'УШЕЛ АХАХА', 'Просто взял и вышел',
  'F', 'Press F', 'ГГ', 'Минус тип', 'Помянем', 'Сбежал трусишка',
  'Не выдержал', 'Ариведерчи', 'Пока-пока', 'Чел хорош (нет)',
  'Слабак', 'Туда его',
];

const ESCAPE_IRONIC = [
  'Очень профессионально (нет)', 'Мастер-класс по уходу от ответа',
  'Лучший финал интервью', 'Гений переговоров',
  'А так всё хорошо начиналось', 'Репутация вышла из чата',
  'Победа засчитана!', 'Как корова языком слизнула',
  'Технично', 'Оскар в студию за этот побег', 'Уровень - бог',
];

const ESCAPE_QUESTIONS = [
  'Эээ, а куда он?', 'Звук пропал?', 'Чат, он реально вышел?',
  'Ахха, что произошло?', 'Вылетел походу?', 'Алло?',
  'А ответ будет?', 'Куда-куда?', 'Чо?', 'Связь упала?',
];

const ESCAPE_ANGRY = [
  'Позор какой-то', 'Кринж года', 'Фуууу', 'Кого вы позвали?',
  'Это провал', 'И за это им платят?', 'Стыдоба',
  'Закопал бренд за 10 секунд', 'Мда, уровень...', 'Испанский стыд',
];

const ESCAPE_SLANG = [
  'Сделал ноги', 'Тапки в пол', 'Включил форсаж', 'Ищи свищи',
  'Испарился', 'Смылся в туман', 'Капитулировал', 'В кусты',
  'Заднюю дал', 'Скипнул',
];

const generateEscapePhrase = () => {
  const rand = Math.random();
  const enhance = (text: string) => {
    if (Math.random() > 0.85) return text.toUpperCase();
    if (Math.random() > 0.9) return text + '!!!!!';
    if (Math.random() > 0.8) return text + ' 😂😂😂';
    return text;
  };
  if (rand < 0.25) return enhance(ESCAPE_DIRECT[Math.floor(Math.random() * ESCAPE_DIRECT.length)]);
  if (rand < 0.5) return enhance(ESCAPE_IRONIC[Math.floor(Math.random() * ESCAPE_IRONIC.length)]);
  if (rand < 0.7) return enhance(ESCAPE_QUESTIONS[Math.floor(Math.random() * ESCAPE_QUESTIONS.length)]);
  if (rand < 0.85) return enhance(ESCAPE_ANGRY[Math.floor(Math.random() * ESCAPE_ANGRY.length)]);
  return enhance(ESCAPE_SLANG[Math.floor(Math.random() * ESCAPE_SLANG.length)]);
};

const PHRASES_ESCAPE_POOL = Array.from({ length: 300 }, () => generateEscapePhrase());

const AUTHOR_COLORS = [
  '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#a78bfa', '#fb923c', '#38bdf8', '#e879f9', '#4ade80',
  '#f87171', '#2dd4bf', '#c084fc', '#facc15', '#22d3ee',
];

function getAuthorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

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
  rootEmbedded: css`
    height: 100%;
    max-height: 100%;
    border-radius: 0;
    border: none;
    background: transparent;
    backdrop-filter: none;
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: rgba(31, 41, 55, 0.95);
    border-bottom: 1px solid rgba(55, 65, 81, 0.8);
  `,
  headerEmbedded: css`
    background: transparent;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding: 6px 14px;
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
      0% { transform: scale(1); opacity: 1; }
      70% { transform: scale(1.6); opacity: 0; }
      100% { transform: scale(1); opacity: 0; }
    }
  `,
  viewers: css`
    font-size: 11px;
    color: #6b7280;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  `,
  list: css`
    flex: 1;
    overflow-y: auto;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  message: css`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    line-height: 1.4;
    color: #e5e7eb;
    opacity: 0;
    transform: translateY(6px);
    animation: fadeInUp 0.25s ease-out forwards;

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `,
  avatar: css`
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
    margin-top: 1px;
  `,
  msgBody: css`
    min-width: 0;
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
    color: #d1d5db;
  `,
  timestamp: css`
    font-size: 10px;
    color: rgba(148, 163, 184, 0.5);
    margin-left: 6px;
    white-space: nowrap;
  `,
}));

export function LiveChat({
  score,
  showMessagesAfterTs = null,
  mode = 'default',
  fullHeight = false,
  embedded = false,
}: LiveChatProps) {
  const { styles, cx } = useStyles();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [canShowMessages, setCanShowMessages] = useState(!showMessagesAfterTs);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const viewersRef = useRef(Math.floor(Math.random() * 1000 + 500));

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    const makeEscapeMessage = (): ChatMessage => {
      const text = PHRASES_ESCAPE_POOL[Math.floor(Math.random() * PHRASES_ESCAPE_POOL.length)];
      const author = AUTHORS[Math.floor(Math.random() * AUTHORS.length)];
      return {
        id: Math.random().toString(36).substring(7),
        author,
        text,
        type: Math.random() < 0.8 ? 'negative' : 'neutral',
      };
    };

    if (mode === 'escape') {
      setMessages((prev) => {
        if (prev.length >= MAX_MESSAGES) return prev;
        const seed = [...prev];
        while (seed.length < MAX_MESSAGES) seed.push(makeEscapeMessage());
        return seed.slice(-MAX_MESSAGES);
      });
    }

    const generateMessage = () => {
      if (mode === 'escape') {
        const newMessage = makeEscapeMessage();
        setMessages((prev) => {
          const next = [...prev, newMessage];
          return next.length <= MAX_MESSAGES ? next : next.slice(-MAX_MESSAGES);
        });
        return;
      }

      const isPositiveScore = score >= 5;
      const isNegativeScore = score <= -5;

      let type: 'neutral' | 'positive' | 'negative' = 'neutral';
      let pool: string[];

      const rand = Math.random();
      if (isNegativeScore) {
        if (rand < 0.5) { type = 'negative'; pool = PHRASES_NEGATIVE; }
        else if (rand < 0.7) { type = 'neutral'; pool = PHRASES_NEUTRAL; }
        else if (rand < 0.85) { type = 'neutral'; pool = PHRASES_MEME; }
        else { type = 'positive'; pool = PHRASES_POSITIVE; }
      } else if (isPositiveScore) {
        if (rand < 0.55) { type = 'positive'; pool = PHRASES_POSITIVE; }
        else if (rand < 0.75) { type = 'neutral'; pool = PHRASES_NEUTRAL; }
        else if (rand < 0.9) { type = 'neutral'; pool = PHRASES_QUESTION; }
        else { type = 'negative'; pool = PHRASES_NEGATIVE; }
      } else {
        if (rand < 0.25) { type = 'positive'; pool = PHRASES_POSITIVE; }
        else if (rand < 0.5) { type = 'negative'; pool = PHRASES_NEGATIVE; }
        else if (rand < 0.7) { type = 'neutral'; pool = PHRASES_NEUTRAL; }
        else if (rand < 0.85) { type = 'neutral'; pool = PHRASES_QUESTION; }
        else { type = 'neutral'; pool = PHRASES_MEME; }
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
        return next.length <= MAX_MESSAGES ? next : next.slice(-MAX_MESSAGES);
      });
    };

    const intervalMs = mode === 'escape' ? Math.random() * 700 + 600 : Math.random() * 2500 + 1500;
    const interval = setInterval(generateMessage, intervalMs);
    return () => clearInterval(interval);
  }, [canShowMessages, mode, score]);

  return (
    <div
      className={cx(styles.root, embedded && styles.rootEmbedded)}
      style={fullHeight && !embedded ? { height: '100%' } : undefined}
    >
      <div className={cx(styles.header, embedded && styles.headerEmbedded)}>
        <div className={styles.headerTitle}>
          <span className={styles.pulseDot} />
          <span>Live чат</span>
        </div>
        <span className={styles.viewers}>
          {viewersRef.current} зрителей
        </span>
      </div>

      <div className={styles.list}>
        {messages.slice(-20).map((msg) => {
          const color = getAuthorColor(msg.author);
          return (
            <div key={msg.id} className={styles.message}>
              <div className={styles.avatar} style={{ background: color + '33', color }}>
                {msg.author[0]}
              </div>
              <div className={styles.msgBody}>
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
                  {msg.author}
                </span>
                <span className={styles.text}>{msg.text}</span>
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}
