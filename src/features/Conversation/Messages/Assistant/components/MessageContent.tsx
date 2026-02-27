import { LOADING_FLAT } from '@lobechat/const';
import { type UIChatMessage } from '@lobechat/types';
import { Block, Button, Flexbox, Text } from '@lobehub/ui';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { ReactionDisplay } from '../../../components/Reaction';
import { messageStateSelectors, useConversationStore } from '../../../store';
import { CollapsedMessage } from '../../AssistantGroup/components/CollapsedMessage';
import DisplayContent from '../../components/DisplayContent';
import FileChunks from '../../components/FileChunks';
import ImageFileListViewer from '../../components/ImageFileListViewer';
import Reasoning from '../../components/Reasoning';
import SearchGrounding from '../../components/SearchGrounding';
import { useMarkdown } from '../useMarkdown';

interface TrainingOption {
  description: string;
  key: 'A' | 'B' | 'C';
  raw: string;
}

const parseOptionLine = (line: string): TrainingOption | null => {
  const trimmed = line.trim();
  if (trimmed.length < 4) return null;

  const key = trimmed[0];
  if (key !== 'A' && key !== 'B' && key !== 'C') return null;
  if (trimmed[1] !== ')') return null;
  if (!/\s/.test(trimmed[2])) return null;

  const description = trimmed.slice(3).trim();
  if (!description) return null;

  return {
    description,
    key,
    raw: trimmed,
  };
};

const extractTrainingSpeechText = (text?: string): string | null => {
  if (!text) return null;

  const quoteMatches = [...text.matchAll(/"([^"\n]{8,})"/g)]
    .map((match) => match[1]?.trim())
    .filter((match): match is string => !!match && match.length > 0);

  if (quoteMatches.length > 0) {
    const longest = quoteMatches.reduce((prev, current) =>
      current.length > prev.length ? current : prev,
    );
    return longest;
  }

  return null;
};

const SCORE_TAG_REGEX = /\[CURRENT_SCORE:\s*(-?\d+)\]/g;
const TURQUOISE_BUTTON_STYLE = {
  backgroundColor: '#14b8a6',
  borderColor: '#14b8a6',
  color: '#ffffff',
};

const OPTION_BLOCK_STYLE = {
  border: '1px solid #99f6e4',
  borderRadius: 10,
  padding: '8px 10px',
};

const TRAINING_TTS_API = '/webapi/tts/google';

const MessageContent = memo<UIChatMessage>(
  ({ id, tools, content, chunksList, search, imageList, metadata, ...props }) => {
    const markdownProps = useMarkdown(id);
    // Use ConversationStore instead of ChatStore
    const generating = useConversationStore(messageStateSelectors.isMessageGenerating(id));
    const isCollapsed = useConversationStore(messageStateSelectors.isMessageCollapsed(id));
    const isReasoning = useConversationStore(messageStateSelectors.isMessageInReasoning(id));
    const addReaction = useConversationStore((s) => s.addReaction);
    const removeReaction = useConversationStore((s) => s.removeReaction);
    const sendMessage = useConversationStore((s) => s.sendMessage);
    const userId = useUserStore(userProfileSelectors.userId)!;

    const isToolCallGenerating = generating && (content === LOADING_FLAT || !content) && !!tools;

    const showSearch = !!search && !!search.citations?.length;
    const showImageItems = !!imageList && imageList.length > 0;
    const spokenTrainingTextRef = useRef<string | null>(null);
    const trainingAudioRef = useRef<HTMLAudioElement | null>(null);
    const trainingAudioAbortRef = useRef<AbortController | null>(null);

    // remove \n to avoid empty content
    // refs: https://github.com/lobehub/lobe-chat/pull/6153
    const showReasoning =
      (!!props.reasoning && props.reasoning.content?.trim() !== '') ||
      (!props.reasoning && isReasoning);

    const showFileChunks = !!chunksList && chunksList.length > 0;

    const reactions = useMemo(() => metadata?.reactions || [], [metadata?.reactions]);

    const options = useMemo<TrainingOption[]>(() => {
      if (!content) return [];

      return content
        .split('\n')
        .map((line) => parseOptionLine(line))
        .filter((item): item is TrainingOption => item !== null);
    }, [content]);

    const isTrainingFlowMessage = useMemo(
      () => options.length > 0 || content?.includes('Варианты действий:'),
      [content, options.length],
    );

    const score = useMemo(() => {
      if (!content) return null;

      const matches = [...content.matchAll(SCORE_TAG_REGEX)];
      const latest = matches.at(-1);
      if (!latest?.[1]) return null;

      const parsed = Number.parseInt(latest[1], 10);
      return Number.isNaN(parsed) ? null : parsed;
    }, [content]);

    const displayContent = useMemo(() => {
      if (!content) return content;

      return content
        .split('\n')
        .filter((line) => parseOptionLine(line) === null)
        .join('\n')
        .replaceAll(SCORE_TAG_REGEX, '')
        .trim();
    }, [content]);

    const trainingSpeechText = useMemo(
      () => (isTrainingFlowMessage ? extractTrainingSpeechText(displayContent) : null),
      [displayContent, isTrainingFlowMessage],
    );

    useEffect(() => {
      if (!isTrainingFlowMessage || generating) return;
      if (!trainingSpeechText) return;
      if (spokenTrainingTextRef.current === trainingSpeechText) return;
      if (typeof window === 'undefined') return;

      const playWithGeminiTTS = async () => {
        trainingAudioAbortRef.current?.abort();
        trainingAudioRef.current?.pause();
        trainingAudioRef.current = null;

        const controller = new AbortController();
        trainingAudioAbortRef.current = controller;

        try {
          const response = await fetch(TRAINING_TTS_API, {
            body: JSON.stringify({ text: trainingSpeechText }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          });

          if (!response.ok) throw new Error(`Gemini TTS request failed: ${response.status}`);

          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);

          trainingAudioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            if (trainingAudioRef.current === audio) trainingAudioRef.current = null;
          };
          audio.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            if (trainingAudioRef.current === audio) trainingAudioRef.current = null;
          };

          await audio.play();
        } catch {
          // Strict Gemini-only mode: do not fallback to browser speech synthesis.
        }
      };

      void playWithGeminiTTS();
      spokenTrainingTextRef.current = trainingSpeechText;

      return () => {
        trainingAudioAbortRef.current?.abort();
      };
    }, [generating, isTrainingFlowMessage, trainingSpeechText]);

    const handleReactionClick = useCallback(
      (emoji: string) => {
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing && existing.users.includes(userId)) {
          removeReaction(id, emoji);
        } else {
          addReaction(id, emoji);
        }
      },
      [id, reactions, addReaction, removeReaction, userId],
    );

    const isActive = useCallback(
      (emoji: string) => {
        const reaction = reactions.find((r) => r.emoji === emoji);
        return !!reaction && reaction.users.includes(userId);
      },
      [reactions, userId],
    );

    const handleOptionClick = useCallback(
      async (option: string) => {
        await sendMessage({ message: option });
      },
      [sendMessage],
    );

    if (isCollapsed) return <CollapsedMessage content={content} id={id} />;

    return (
      <Flexbox gap={8} id={id}>
        {showSearch && (
          <SearchGrounding citations={search?.citations} searchQueries={search?.searchQueries} />
        )}
        {showFileChunks && <FileChunks data={chunksList} />}
        {showReasoning && !isTrainingFlowMessage && <Reasoning {...props.reasoning} id={id} />}
        <DisplayContent
          content={displayContent}
          hasImages={showImageItems}
          id={id}
          isMultimodal={metadata?.isMultimodal}
          isToolCallGenerating={isToolCallGenerating}
          markdownProps={markdownProps}
          tempDisplayContent={metadata?.tempDisplayContent}
        />
        {(options.length > 0 || score !== null) && (
          <Flexbox gap={8}>
            {options.map((option) => (
              <Block key={`${id}-${option.raw}`} style={OPTION_BLOCK_STYLE} variant={'outlined'}>
                <Flexbox gap={6}>
                  <Flexbox horizontal align={'center'}>
                    <Text style={{ color: '#14b8a6' }}>-</Text>
                    <Button
                      size={'small'}
                      style={TURQUOISE_BUTTON_STYLE}
                      variant={'filled'}
                      onClick={() => {
                        void handleOptionClick(option.raw);
                      }}
                    >
                      {`Вариант ${option.key}`}
                    </Button>
                  </Flexbox>
                  <Text fontSize={12} type={'secondary'}>
                    {option.description}
                  </Text>
                </Flexbox>
              </Block>
            ))}
            {score !== null && (
              <Block style={OPTION_BLOCK_STYLE} variant={'outlined'}>
                <Button
                  disabled
                  size={'small'}
                  style={TURQUOISE_BUTTON_STYLE}
                  variant={'filled'}
                >
                  {`Счет: ${score}`}
                </Button>
              </Block>
            )}
          </Flexbox>
        )}
        {showImageItems && <ImageFileListViewer items={imageList} />}
        {reactions.length > 0 && (
          <ReactionDisplay
            isActive={isActive}
            messageId={id}
            reactions={reactions}
            onReactionClick={handleReactionClick}
          />
        )}
      </Flexbox>
    );
  },
);

export default MessageContent;
