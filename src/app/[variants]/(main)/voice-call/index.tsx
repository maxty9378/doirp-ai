'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useSearchParams } from 'react-router-dom';

import WideScreenButton from '@/features/WideScreenContainer/WideScreenButton';

import VoiceCallOnboarding from '../agent/features/Conversation/AgentWelcome/VoiceCallOnboarding';
import GeminiLiveCall from './features/GeminiLiveCall';

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;

    width: 100%;
    height: 100%;
    padding: 12px;

    background: ${cssVar.colorBgLayout};
  `,
  headerActions: css`
    position: sticky;
    z-index: 8;
    inset-block-start: 0;

    display: flex;
    justify-content: flex-end;

    padding-block-end: 8px;
  `,
}));

const VoiceCallPage = memo(() => {
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get('agentId') || 'voice-simulator-lpr';
  const isFieldFighter = agentId === 'training-tp-price-objection';

  return (
    <div className={styles.root}>
      <div className={styles.headerActions}>
        <WideScreenButton />
      </div>
      {isFieldFighter ? <VoiceCallOnboarding /> : <GeminiLiveCall agentId={agentId} />}
    </div>
  );
});

VoiceCallPage.displayName = 'VoiceCallPage';

export default VoiceCallPage;
