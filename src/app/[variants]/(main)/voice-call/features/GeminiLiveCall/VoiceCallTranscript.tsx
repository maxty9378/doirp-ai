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
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: flex-start;

    @media (max-width: 720px) {
      grid-template-columns: 1fr;
    }

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
    opacity: 0.6;
    margin: auto;
    color: var(--colorTextSecondary);
    font-size: 14px;
  `,
  column: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  `,
  columnHeader: css`
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--colorTextSecondary);
  `,
  bubble: css`
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.5;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    word-break: break-word;
  `,
  bubbleAi: css`
    background: var(--colorFillTertiary);
    color: var(--colorText);
    border-radius: 12px 12px 12px 2px;
  `,
  bubbleUser: css`
    background: #1677ff;
    color: #fff;
    border-radius: 12px 12px 2px 12px;
  `,
  columnEmpty: css`
    font-size: 12px;
    color: var(--colorTextSecondary);
    opacity: 0.7;
  `,
}));

const EMPTY_PLACEHOLDER = 'Диалог появится здесь, как только вы начнете говорить.';

export interface ScoreLevelLabelsConfig {
  high?: string;
  low?: string;
  mid?: string;
}

export interface VoiceCallTranscriptProps {
  agentId?: string;
  assistantLabel?: string;
  checkpoints: VoiceCallCheckpoint[];
  /** Цели сценария из редактора; если заданы, используем их как подписи чекпоинтов */
  goals?: string[];
  /** Оставшееся время до автозавершения (секунды), если известно */
  remainingSeconds?: number;
  score: number;
  /** Подписи уровней счёта: low (score < -10), mid (-10..10), high (> 10) */
  scoreLevelLabels?: ScoreLevelLabelsConfig | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  showCheckpoints?: boolean;
  showScore?: boolean;
  transcript: TranscriptEntry[];
  userLabel?: string;
}

const DEFAULT_SCORE_LOW = 'Нужно улучшить';
const DEFAULT_SCORE_MID = 'Неплохо';
const DEFAULT_SCORE_HIGH = 'Отлично';

const VoiceCallTranscript = memo(({
  assistantLabel,
  checkpoints,
  goals,
  remainingSeconds,
  score,
  scoreLevelLabels,
  scrollRef,
  showCheckpoints = true,
  showScore = true,
  transcript,
  userLabel,
}: VoiceCallTranscriptProps) => {
  const getScoreColor = (s: number) => {
    if (s < -10) return '#ff4d4f';
    if (s > 10) return '#52c41a';
    return '#faad14';
  };

  const getScoreLabel = (s: number) => {
    if (s < -10) return scoreLevelLabels?.low?.trim() || DEFAULT_SCORE_LOW;
    if (s > 10) return scoreLevelLabels?.high?.trim() || DEFAULT_SCORE_HIGH;
    return scoreLevelLabels?.mid?.trim() || DEFAULT_SCORE_MID;
  };

  const normalizedScore = Math.max(0, Math.min(100, 50 + score));

  const resolvedAssistantLabel = assistantLabel || 'ИИ-агент';
  const resolvedUserLabel = userLabel || 'Вы';

  const formatSeconds = (total: number) => {
    const clamped = Math.max(0, total);
    const m = Math.floor(clamped / 60);
    const s = clamped % 60;
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const checkpointItems =
    goals && goals.length > 0
      ? goals.map((goal, index) => ({
          id: `goal-${index}`,
          label: goal,
          done: checkpoints[index]?.done ?? false,
        }))
      : checkpoints;

  const aiMessages = transcript.filter((msg) => msg.role === 'ai');
  const userMessages = transcript.filter((msg) => msg.role === 'user');

  return (
    <div className={styles.transcriptWrap}>
      <div className={styles.transcriptHeader}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Диалог</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {typeof remainingSeconds === 'number' && remainingSeconds >= 0 && (
            <span style={{ fontSize: 12, color: 'var(--colorTextSecondary)' }}>
              Авторазрыв через {formatSeconds(remainingSeconds)}
            </span>
          )}
          {showScore && (
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
          )}
        </div>
      </div>

      {showCheckpoints && checkpointItems.length > 0 && (
        <div className={styles.checkpointWrap}>
          {checkpointItems.map((checkpoint) => (
            <div
              className={`${styles.checkpointItem} ${checkpoint.done ? styles.checkpointDone : ''}`}
              key={checkpoint.id}
            >
              {checkpoint.done ? '[x] ' : '[ ] '}
              {checkpoint.label}
            </div>
          ))}
        </div>
      )}

      <div className={styles.transcriptLog} ref={scrollRef}>
        {transcript.length === 0 ? (
          <div className={styles.placeholder}>{EMPTY_PLACEHOLDER}</div>
        ) : (
          <>
            <div className={styles.column}>
              <div className={styles.columnHeader}>
                <Avatar avatar={'ИИ'} size={24} />
                <span>{resolvedAssistantLabel}</span>
              </div>
              {aiMessages.length === 0 ? (
                <div className={styles.columnEmpty}>Пока нет сообщений от ИИ.</div>
              ) : (
                aiMessages.map((msg, i) => (
                  <div key={`ai-${i}`} className={`${styles.bubble} ${styles.bubbleAi}`}>
                    {msg.text}
                  </div>
                ))
              )}
            </div>

            <div className={styles.column}>
              <div className={styles.columnHeader}>
                <Avatar avatar={'Вы'} background={'#1677ff'} size={24} />
                <span>{resolvedUserLabel}</span>
              </div>
              {userMessages.length === 0 ? (
                <div className={styles.columnEmpty}>Пока нет ваших фраз.</div>
              ) : (
                userMessages.map((msg, i) => (
                  <div key={`user-${i}`} className={`${styles.bubble} ${styles.bubbleUser}`}>
                    {msg.text}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

VoiceCallTranscript.displayName = 'VoiceCallTranscript';

export default VoiceCallTranscript;
