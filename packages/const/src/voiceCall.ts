export const DEFAULT_VOICE_CALL_AGENT_ID = 'training-gfd-stress';
export const GFD_GOOGLE_LIVE_VOICE_AGENT_ID = 'training-gfd-stress-google-live';
export const TP_PRICE_VOICE_AGENT_ID = 'training-tp-price-objection';

export const DEFAULT_VOICE_CALL_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const GEMINI_31_FLASH_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

/** Обязательный запасной промпт финальной реплики, если в БД поле пустое (совпадает с миграциями 0098/0100). */
export const DEFAULT_TRAINING_ROUND_ENDING_PROMPT =
  'Через 15 секунд наш эфир на конференции подходит к концу. Кратко подведи итог: убедил ли тебя собеседник или нет, и скажи: "зрители нашего стрима сами сделают выводы". После этого естественно завершай разговор как в реальном живом общении на мероприятии, без служебных фраз про окончание звонка.';

export const isOfficialGoogleLiveTrainer = (_agentId: string) => true;

export const resolveVoiceCallScenarioKey = (agentId: string) =>
  isOfficialGoogleLiveTrainer(agentId) ? DEFAULT_VOICE_CALL_AGENT_ID : agentId;
