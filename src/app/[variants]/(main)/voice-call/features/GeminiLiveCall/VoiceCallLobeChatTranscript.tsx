'use client';

import type { UIChatMessage } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo, useMemo, type RefObject } from 'react';

import { ChatList, ConversationProvider } from '@/features/Conversation';
import type { ConversationContext } from '@/features/Conversation';

import type { TranscriptEntry } from './useGeminiLive';

const VOICE_CALL_CONTEXT: ConversationContext = {
  agentId: 'voice-call',
  topicId: null,
  threadId: null,
};

const styles = createStaticStyles(({ css }) => ({
  wrap: css`
    width: 100%;
    flex: 1 1 0;
    min-height: 280px;
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    background: var(--colorBgContainer);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--colorBorderSecondary);
  `,
  welcome: css`
    text-align: center;
    opacity: 0.7;
    padding: 24px 16px;
    color: var(--colorTextSecondary);
    font-size: 14px;
  `,
}));

function transcriptToUIChatMessages(transcript: TranscriptEntry[]): UIChatMessage[] {
  return transcript.map((msg, i) => ({
    id: `voice-call-msg-${i}`,
    role: msg.role === 'ai' ? 'assistant' : 'user',
    content: msg.text,
    createdAt: i,
  })) as UIChatMessage[];
}

export interface VoiceCallLobeChatTranscriptProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  transcript: TranscriptEntry[];
}

const VoiceCallLobeChatTranscript = memo(({ scrollRef, transcript }: VoiceCallLobeChatTranscriptProps) => {
  const messages = useMemo(
    () => transcriptToUIChatMessages(transcript),
    [transcript],
  );

  const welcome = <div className={styles.welcome}>Поздоровайтесь с клиентом...</div>;

  return (
    <div className={styles.wrap} ref={scrollRef}>
      <ConversationProvider
        context={VOICE_CALL_CONTEXT}
        hasInitMessages={true}
        messages={messages}
        skipFetch={true}
      >
        <Flexbox
          flex={1}
          style={{ overflowX: 'hidden', overflowY: 'auto', position: 'relative' }}
        >
          <ChatList disableActionsBar welcome={welcome} />
        </Flexbox>
      </ConversationProvider>
    </div>
  );
});

VoiceCallLobeChatTranscript.displayName = 'VoiceCallLobeChatTranscript';

export default VoiceCallLobeChatTranscript;
