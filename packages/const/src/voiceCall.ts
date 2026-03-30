export const DEFAULT_VOICE_CALL_AGENT_ID = 'training-gfd-stress';
export const GFD_GOOGLE_LIVE_VOICE_AGENT_ID = 'training-gfd-stress-google-live';
export const TP_PRICE_VOICE_AGENT_ID = 'training-tp-price-objection';

export const DEFAULT_VOICE_CALL_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';
export const GEMINI_31_FLASH_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

export const isOfficialGoogleLiveTrainer = (agentId: string) =>
  agentId === GFD_GOOGLE_LIVE_VOICE_AGENT_ID || agentId === DEFAULT_VOICE_CALL_AGENT_ID;

export const resolveVoiceCallScenarioKey = (agentId: string) =>
  isOfficialGoogleLiveTrainer(agentId) ? DEFAULT_VOICE_CALL_AGENT_ID : agentId;
