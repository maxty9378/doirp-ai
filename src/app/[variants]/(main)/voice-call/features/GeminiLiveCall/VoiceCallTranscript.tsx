'use client';

import { Avatar } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo, type RefObject } from 'react';

import type { TranscriptEntry, VoiceCallCheckpoint } from './useGeminiLive';

const styles = createStaticStyles(({ css }) => ({
  transcriptWrap: css`
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    margin-top: 24px;
    background: var(--colorBgContainer);
    border-radius: 16px;
    border: 1px solid var(--colorBorderSecondary);
    overflow: hidden;
    position: relative;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  `,
  transcriptHeader: css`
    padding: 12px 16px;
    border-bottom: 1px solid var(--colorBorderSecondary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--colorBgLayout);
  `,
  scoreWrap: css`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
  `,
  scoreScale: css`
    width: 100px;
    height: 8px;
    background: var(--colorFillSecondary);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  `,
  scoreFill: css`
    height: 100%;
    transition: width 0.3s ease, background 0.3s ease;
  `,
  checkpointWrap: css`
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--colorBorderSecondary);
    background: var(--colorFillQuaternary);
    flex-wrap: wrap;
  `,
  checkpointItem: css`
    font-size: 12px;
    border-radius: 999px;
    padding: 4px 10px;
    border: 1px solid var(--colorBorderSecondary);
    color: var(--colorTextSecondary);
  `,
  checkpointDone: css`
    border-color: #16a34a;
    color: #166534;
    background: #dcfce7;
  `,
  transcriptLog: css`
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--colorFillSecondary);
      border-radius: 4px;
    }
  `,
  placeholder: css`
    text-align: center;
    opacity: 0.5;
    margin-top: auto;
    margin-bottom: auto;
    color: var(--colorTextSecondary);
    font-size: 14px;
  `,
  bubbleRow: css`
    display: flex;
    width: 100%;
    gap: 12px;
  `,
  rowAi: css`
    flex-direction: row;
  `,
  rowUser: css`
    flex-direction: row-reverse;
  `,
  bubbleWrap: css`
    display: flex;
    flex-direction: column;
    max-width: 80%;
  `,
  bubbleAi: css`
    align-items: flex-start;
    .bubble-text {
      background: var(--colorFillTertiary);
      color: var(--colorText);
      border-radius: 12px 12px 12px 2px;
    }
  `,
  bubbleUser: css`
    align-items: flex-end;
    .bubble-text {
      background: #1677ff;
      color: #fff;
      border-radius: 12px 12px 2px 12px;
    }
  `,
  bubbleText: css`
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  `,
  bubbleLabel: css`
    font-size: 12px;
    opacity: 0.6;
    margin-bottom: 4px;
    color: var(--colorTextSecondary);
    padding: 0 4px;
  `,
  avatar: css`
    flex-shrink: 0;
    margin-top: 20px;
  `,
}));

const EMPTY_PLACEHOLDER = 'Поздоровайтесь с клиентом...';

export interface VoiceCallTranscriptProps {
  agentId: string;
  checkpoints: VoiceCallCheckpoint[];
  score: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  transcript: TranscriptEntry[];
}

const VoiceCallTranscript = memo(({ agentId, checkpoints, score, scrollRef, transcript }: VoiceCallTranscriptProps) => {
  const getScoreColor = (s: number) => {
    if (s < -10) return '#ff4d4f';
    if (s > 10) return '#52c41a';
    return '#faad14';
  };

  const getScoreLabel = (s: number) => {
    if (s < -10) return 'ЛПР злится';
    if (s > 10) return 'Лояльность растет';
    return 'Нейтрально';
  };

  // Normalizing score for the bar (assuming -50 to 50 range roughly)
  const normalizedScore = Math.max(0, Math.min(100, 50 + score));

  const isLpr = agentId === 'voice-simulator-lpr' || agentId === 'training-tp-price-objection';
  const aiName = isLpr ? 'Марина Ивановна' : 'Собеседник';

  return (
    <div className={styles.transcriptWrap}>
      <div className={styles.transcriptHeader}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>История диалога</div>
        <div className={styles.scoreWrap}>
          <span>{getScoreLabel(score)}</span>
          <div className={styles.scoreScale}>
            <div
              className={styles.scoreFill}
              style={{
                width: `${normalizedScore}%`,
                background: getScoreColor(score),
              }}
            />
          </div>
          <span style={{ minWidth: 24, textAlign: 'right' }}>{score > 0 ? `+${score}` : score}</span>
        </div>
      </div>

      <div className={styles.checkpointWrap}>
        {checkpoints.map((checkpoint) => (
          <div
            className={`${styles.checkpointItem} ${checkpoint.done ? styles.checkpointDone : ''}`}
            key={checkpoint.id}
          >
            {checkpoint.done ? '[x] ' : '[ ] '}
            {checkpoint.label}
          </div>
        ))}
      </div>

      <div className={styles.transcriptLog} ref={scrollRef}>
        {transcript.length === 0 ? (
          <div className={styles.placeholder}>{EMPTY_PLACEHOLDER}</div>
        ) : (
          transcript.map((msg, i) => {
            const isAi = msg.role === 'ai';
            return (
              <div
                key={i}
                className={`${styles.bubbleRow} ${isAi ? styles.rowAi : styles.rowUser}`}
              >
                <div className={styles.avatar}>
                  {isAi ? (
                    <Avatar avatar={isLpr ? '💼' : '🤖'} size={32} />
                  ) : (
                    <Avatar avatar={'😎'} background={'#1677ff'} size={32} />
                  )}
                </div>
                
                <div className={`${styles.bubbleWrap} ${isAi ? styles.bubbleAi : styles.bubbleUser}`}>
                  <div className={styles.bubbleLabel}>{isAi ? aiName : 'Вы'}</div>
                  <div className={`bubble-text ${styles.bubbleText}`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

VoiceCallTranscript.displayName = 'VoiceCallTranscript';

export default VoiceCallTranscript;
