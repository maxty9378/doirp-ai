'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useSearchParams } from 'react-router-dom';

import GeminiLiveCall from './features/GeminiLiveCall';

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: ${cssVar.colorBgLayout};
    padding: 24px;
  `,
}));

const VoiceCallPage = memo(() => {
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get('agentId') || 'voice-simulator-lpr';

  return (
    <div className={styles.root}>
      <GeminiLiveCall agentId={agentId} />
    </div>
  );
});

VoiceCallPage.displayName = 'VoiceCallPage';

export default VoiceCallPage;
