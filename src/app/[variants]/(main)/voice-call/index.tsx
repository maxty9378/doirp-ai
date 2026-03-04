'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useSearchParams } from 'react-router-dom';

import VoiceCallOnboarding from '../agent/features/Conversation/AgentWelcome/VoiceCallOnboarding';
import GeminiLiveCall from './features/GeminiLiveCall';

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    width: 100%;
    height: 100%;
    padding: 24px;

    background: ${cssVar.colorBgLayout};
  `,
}));

const VoiceCallPage = memo(() => {
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get('agentId') || 'voice-simulator-lpr';
  const isFieldFighter = agentId === 'training-tp-price-objection';

  return (
    <div className={styles.root}>
      {isFieldFighter ? <VoiceCallOnboarding /> : <GeminiLiveCall agentId={agentId} />}
    </div>
  );
});

VoiceCallPage.displayName = 'VoiceCallPage';

export default VoiceCallPage;
