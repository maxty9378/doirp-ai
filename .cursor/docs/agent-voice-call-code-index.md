# Код, отвечающий за агента «Полевой боец» и голосовой звонок

## 1. Конфиг и пресеты агента

| Файл | Назначение |
|------|------------|
| `src/config/initialAgents/trading-rep-price-objection.json` | Пресет агента: title «Полевой боец: Дорого», `marketIdentifier: "training-tp-price-objection"`, systemRole для текстового чата (A/B/C), описание сценария. |
| `src/config/initialAgents/index.ts` | Экспорт `VOICE_CALL_PRESETS`, `TRADING_REP_PRICE_OBJECTION_PRESET`; маппинг `training-tp-price-objection` → пресет. |

## 2. API бэкенда (voice-call)

| Файл | Назначение |
|------|------------|
| `src/app/(backend)/api/voice-call/config/route.ts` | **GET** `/api/voice-call/config?agentId=...` — возвращает `apiKey`, `systemInstruction`, `voiceName` для Gemini Live. Для `training-tp-price-objection`: отдельная инструкция (только реплики ЛПР), голос **Kore** (женский). |
| `src/app/(backend)/api/voice-call/generate-legend-audio/route.ts` | **POST** `/api/voice-call/generate-legend-audio` — генерирует озвучку легенды через Gemini TTS (мужской голос Charon, стиль трейлера), сохраняет в `public/audio/legend-polevoi-boez.wav`. |

## 3. Страница агента и онбординг (чат)

| Файл | Назначение |
|------|------------|
| `src/app/[variants]/(main)/agent/features/Conversation/AgentWelcome/index.tsx` | Приветствие агента: если `marketIdentifier === 'training-tp-price-objection'` рендерит **VoiceCallOnboarding**, иначе обычный **InboxWelcome**. |
| `src/app/[variants]/(main)/agent/features/Conversation/AgentWelcome/VoiceCallOnboarding.tsx` | Онбординг «Полевой боец»: шаг «Зайти в торговую точку» → легенда (текст + озвучка WAV или TTS) → «Готов начать» → встроенный **GeminiLiveCall**. Воспроизведение `/audio/legend-polevoi-boez.wav`. |
| `src/app/[variants]/(main)/agent/features/Conversation/ConversationArea.tsx` | Передаёт `<WelcomeChatItem />` (AgentWelcome) в ChatList. |

## 4. Голосовой звонок (Gemini Live)

| Файл | Назначение |
|------|------------|
| `src/app/[variants]/(main)/voice-call/features/GeminiLiveCall/useGeminiLive.ts` | Хук: WebSocket к Gemini Live, запрос конфига по `agentId`, микрофон → PCM → WS, воспроизведение ответов ИИ, `userVolume`/`aiVolume` для эквалайзеров, стартовый триггер для `training-tp-price-objection` («Начинай диалог. Скажи первую реплику от лица Марины Ивановны.»). |
| `src/app/[variants]/(main)/voice-call/features/GeminiLiveCall/index.tsx` | UI звонка: два экрана (ИИ / пользователь), эквалайзеры по `userVolume`/`aiVolume`, кнопка завершить, поддержка `embedded` и `autoConnect`. |
| `src/app/[variants]/(main)/voice-call/index.tsx` | Страница `/voice-call`: читает `agentId` из query, рендерит **GeminiLiveCall**. |

## 5. Роутинг и константы

| Файл | Назначение |
|------|------------|
| `packages/const/src/url.ts` | `VOICE_CALL_URL(agentId)` → `/voice-call?agentId=...`. |
| `src/app/[variants]/router/desktopRouter.config.tsx` | Маршрут страницы voice-call (если используется в десктопе). |

## 6. Главная страница (виджеты)

| Файл | Назначение |
|------|------------|
| `src/app/[variants]/(main)/home/features/VoiceSimulatorWidget/index.tsx` | Виджет «Голосовой тренажер ЛПР» (voice-simulator-lpr). |
| `src/app/[variants]/(main)/home/features/VoiceCallFieldFighterWidget/index.tsx` | Виджет «Полевой боец: Дорого» — ссылка на `/voice-call?agentId=training-tp-price-objection`. |
| `src/app/[variants]/(main)/home/features/index.tsx` | Подключение виджетов на главной. |

## 7. Store и селекторы агента

| Файл | Назначение |
|------|------------|
| `src/store/agent/selectors/selectors.ts` | `currentAgentMeta` — возвращает в т.ч. `marketIdentifier` текущего агента (для выбора VoiceCallOnboarding). |

## 8. Генерация озвучки легенды (скрипт и статика)

| Файл | Назначение |
|------|------------|
| `scripts/generate-legend-audio.mts` | Скрипт: Gemini TTS (Charon, трейлер) → `public/audio/legend-polevoi-boez.wav`. Запуск: `bun run generate:legend-audio`. |
| `public/audio/legend-polevoi-boez.wav` | Сохранённая озвучка легенды (проигрывается на шаге «легенда»). |
| `public/audio/.gitkeep` | Комментарий про генерацию озвучки. |

## 9. TTS (общий, для справки)

| Файл | Назначение |
|------|------------|
| `src/app/(backend)/webapi/tts/google/route.ts` | Общий POST TTS через Gemini (используется для синтеза речи в других местах; легенда генерируется отдельно и сохраняется в WAV). |

---

**Идентификатор агента в коде:** `training-tp-price-objection` (совпадает с `marketIdentifier` в пресете).

**Точка входа на странице агента:** открыть `/agent/agt_xxx` для агента с `marketIdentifier === 'training-tp-price-objection'` → показывается онбординг с кнопкой «Зайти в торговую точку», затем легенда и встроенный голосовой звонок.
