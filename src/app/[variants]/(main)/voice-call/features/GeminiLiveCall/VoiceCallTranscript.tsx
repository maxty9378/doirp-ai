'use client';

import { createStaticStyles } from 'antd-style';
import { memo, type RefObject } from 'react';

import type { TranscriptEntry } from './useGeminiLive';

const styles = createStaticStyles(({ css }) => ({
  transcriptLog: css`
    width: 100%;
    flex: 1;
    min-height: 150px;
    overflow-y: auto;
    background: rgba(15, 23, 42, 0.3);
    border-radius: 16px;
    padding: 16px;
    margin-top: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
  `,
  placeholder: css`
    text-align: center;
    opacity: 0.5;
    margin-top: 20px;
    color: #fff;
    font-size: 14px;
  `,
  bubbleWrap: css`
    display: flex;
    width: 100%;
  `,
  bubbleAi: css`
    justify-content: flex-start;
    .bubble-text {
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.25);
      color: #e0e7ff;
      border-radius: 16px 16px 16px 4px;
    }
  `,
  bubbleUser: css`
    justify-content: flex-end;
    .bubble-text {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #d1fae5;
      border-radius: 16px 16px 4px 16px;
    }
  `,
  bubbleText: css`
    min-width: 160px;
    max-width: 92%;
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.5;
  `,
  bubbleLabel: css`
    font-size: 11px;
    opacity: 0.6;
    display: block;
    margin-bottom: 4px;
  `,
}));

const EMPTY_PLACEHOLDER = 'Поздоровайтесь с клиентом...';

export interface VoiceCallTranscriptProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  transcript: TranscriptEntry[];
}

const VoiceCallTranscript = memo(({ scrollRef, transcript }: VoiceCallTranscriptProps) => (
  <div className={styles.transcriptLog} ref={scrollRef}>
    {transcript.length === 0 ? (
      <div className={styles.placeholder}>{EMPTY_PLACEHOLDER}</div>
    ) : (
      transcript.map((msg, i) => (
        <div
          key={i}
          className={`${styles.bubbleWrap} ${msg.role === 'ai' ? styles.bubbleAi : styles.bubbleUser}`}
        >
          <div className={`bubble-text ${styles.bubbleText}`}>
            <span className={styles.bubbleLabel}>
              {msg.role === 'ai' ? 'Марина Ивановна' : 'Вы'}
            </span>
            {msg.text}
          </div>
        </div>
      ))
    )}
  </div>
));

VoiceCallTranscript.displayName = 'VoiceCallTranscript';

export default VoiceCallTranscript;
