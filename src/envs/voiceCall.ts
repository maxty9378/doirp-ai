export const getVoiceCallConfig = () => {
  return {
    VOICE_CALL_PROXY_SHARED_SECRET: process.env.VOICE_CALL_PROXY_SHARED_SECRET,
  };
};

export const voiceCallEnv = getVoiceCallConfig();
