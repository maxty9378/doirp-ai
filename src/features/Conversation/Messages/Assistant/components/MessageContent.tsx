import { LOADING_FLAT } from '@lobechat/const';
import { type UIChatMessage } from '@lobechat/types';
import { Block, Button, Flexbox, Text } from '@lobehub/ui';
import { App } from 'antd';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useInsertOnPageContext } from '@/features/PageEditor/InsertOnPageContext';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { ReactionDisplay } from '../../../components/Reaction';
import { dataSelectors, messageStateSelectors, useConversationStore } from '../../../store';
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

interface TrainingRecognitionResult {
  0: { transcript: string };
  isFinal: boolean;
}

interface TrainingRecognitionEvent extends Event {
  results: ArrayLike<TrainingRecognitionResult>;
}

interface TrainingSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: null | (() => void);
  onerror: null | ((event: Event) => void);
  onresult: null | ((event: TrainingRecognitionEvent) => void);
  start: () => void;
  stop: () => void;
}

interface TrainingSpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => TrainingSpeechRecognition;
  webkitSpeechRecognition?: new () => TrainingSpeechRecognition;
}

type VoiceSupportState = 'supported' | 'unsupported';

const RU = {
  actionsLabel: 'Варианты действий:',
  answerByVoice: 'Ответить голосом',
  choose: 'Выбрать',
  client: 'клиент',
  hotkeysHint: 'Горячие клавиши: A / B / C',
  listening: 'Идет запись... говорите',
  noVoiceSupport: 'В этом браузере нет голосового ввода',
  recognized: 'Распознано',
  score: 'Счет',
  stopRecording: 'Остановить запись',
  timer: 'Осталось',
  timerExpired: 'Время вышло',
  variant: 'Вариант',
  you: 'Вы',
} as const;

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
const CLIENT_ROLE_REGEX = new RegExp(`^(\\s*\\**)(${RU.client})(:\\**\\s*)`, 'i');
const TURQUOISE_BUTTON_STYLE = {
  backgroundColor: '#14b8a6',
  borderColor: '#14b8a6',
  color: '#ffffff',
};

const OPTION_BLOCK_STYLE = {
  background: 'linear-gradient(180deg, #f0fdfa 0%, #ffffff 100%)',
  border: '1px solid #5eead4',
  borderRadius: 12,
  padding: '10px 12px',
};
const ROUND_PANEL_STYLE = {
  background: 'linear-gradient(90deg, #f0fdfa 0%, #ecfeff 100%)',
  border: '1px solid #5eead4',
  borderRadius: 12,
  padding: '8px 12px',
  position: 'sticky' as const,
  top: 8,
  zIndex: 2,
};

const TRAINING_TTS_API = '/webapi/tts/google';
let activeTrainingAudio: HTMLAudioElement | null = null;
let activeTrainingAudioUrl: string | null = null;
let activeTrainingAudioAbortController: AbortController | null = null;
let lastAutoPlayedMessageId: string | null = null;

const stopTrainingAudio = () => {
  activeTrainingAudioAbortController?.abort();
  activeTrainingAudioAbortController = null;

  if (activeTrainingAudio) {
    activeTrainingAudio.pause();
    activeTrainingAudio.currentTime = 0;
    activeTrainingAudio = null;
  }

  if (activeTrainingAudioUrl) {
    URL.revokeObjectURL(activeTrainingAudioUrl);
    activeTrainingAudioUrl = null;
  }
};

const normalizeTrainingDisplayContent = (rawContent: string) => {
  const withoutOptionsAndScore = rawContent
    .split('\n')
    .filter((line) => parseOptionLine(line) === null)
    .join('\n')
    .replaceAll(SCORE_TAG_REGEX, '')
    .trim();

  let clientRoleCount = 0;
  return withoutOptionsAndScore
    .split('\n')
    .map((line) => {
      if (!CLIENT_ROLE_REGEX.test(line)) return line;

      clientRoleCount += 1;
      if (clientRoleCount <= 1) return line;

      return line.replace(CLIENT_ROLE_REGEX, `$1${RU.you}$2`);
    })
    .join('\n');
};

const INSERT_ON_PAGE_BUTTON_STYLE = { marginTop: 6 } as const;

const MessageContent = memo<UIChatMessage>(
  ({ id, tools, content, chunksList, search, imageList, metadata, ...props }) => {
    const { t } = useTranslation('chat');
    const { message: messageApi } = App.useApp();
    const markdownProps = useMarkdown(id);
    const context = useConversationStore((s) => s.context);
    const insertOnPageContext = useInsertOnPageContext();
    const generating = useConversationStore(messageStateSelectors.isMessageGenerating(id));
    const isCollapsed = useConversationStore(messageStateSelectors.isMessageCollapsed(id));
    const isReasoning = useConversationStore(messageStateSelectors.isMessageInReasoning(id));
    const addReaction = useConversationStore((s) => s.addReaction);
    const removeReaction = useConversationStore((s) => s.removeReaction);
    const sendMessage = useConversationStore((s) => s.sendMessage);
    const latestAssistantMessageId = useConversationStore((s) => {
      const lastAssistant = dataSelectors
        .displayMessages(s)
        .slice()
        .reverse()
        .find((message) => message.role === 'assistant');

      return lastAssistant?.id;
    });
    const userId = useUserStore(userProfileSelectors.userId)!;

    const [isVoiceListening, setIsVoiceListening] = useState(false);
    const [isReplayLoading, setIsReplayLoading] = useState(false);
    const [voiceLastTranscript, setVoiceLastTranscript] = useState('');
    const [selectedOptionKey, setSelectedOptionKey] = useState<TrainingOption['key'] | null>(null);
    const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
    const [roundTimeLeft, setRoundTimeLeft] = useState(30);
    const [voiceSupport] = useState<VoiceSupportState>(() => {
      if (typeof window === 'undefined') return 'unsupported';

      const speechWindow = window as TrainingSpeechRecognitionWindow;
      return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
        ? 'supported'
        : 'unsupported';
    });

    const isToolCallGenerating = generating && (content === LOADING_FLAT || !content) && !!tools;

    const showSearch = !!search && !!search.citations?.length;
    const showImageItems = !!imageList && imageList.length > 0;
    const speechRecognitionRef = useRef<TrainingSpeechRecognition | null>(null);

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
      () => options.length > 0 || content?.includes(RU.actionsLabel),
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

      return normalizeTrainingDisplayContent(content);
    }, [content]);

    const trainingSpeechText = useMemo(
      () => (isTrainingFlowMessage ? extractTrainingSpeechText(displayContent) : null),
      [displayContent, isTrainingFlowMessage],
    );

    const handleOptionClick = useCallback(
      async (option: TrainingOption) => {
        setSelectedOptionKey(option.key);
        setIsSubmittingAnswer(true);
        await sendMessage({ message: `${RU.variant} ${option.key}: ${option.description}` });
      },
      [sendMessage],
    );

    const playTrainingSpeech = useCallback(
      async (text: string) => {
        if (typeof window === 'undefined') return;

        setIsReplayLoading(true);
        stopTrainingAudio();

        const controller = new AbortController();
        activeTrainingAudioAbortController = controller;

        try {
          const response = await fetch(TRAINING_TTS_API, {
            body: JSON.stringify({ text }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          });

          if (!response.ok) throw new Error(`Gemini TTS request failed: ${response.status}`);

          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);

          activeTrainingAudio = audio;
          activeTrainingAudioUrl = audioUrl;
          audio.onended = () => {
            if (activeTrainingAudio === audio) {
              activeTrainingAudio = null;
            }
            if (activeTrainingAudioUrl === audioUrl) {
              URL.revokeObjectURL(audioUrl);
              activeTrainingAudioUrl = null;
            }
          };
          audio.onerror = () => {
            if (activeTrainingAudio === audio) {
              activeTrainingAudio = null;
            }
            if (activeTrainingAudioUrl === audioUrl) {
              URL.revokeObjectURL(audioUrl);
              activeTrainingAudioUrl = null;
            }
          };

          await audio.play();
        } catch {
          // Strict Gemini-only mode: do not fallback to browser speech synthesis.
        } finally {
          setIsReplayLoading(false);
        }
      },
      [setIsReplayLoading],
    );

    const handleReplayClick = useCallback(() => {
      if (!trainingSpeechText) return;
      void playTrainingSpeech(trainingSpeechText);
    }, [playTrainingSpeech, trainingSpeechText]);

    const handleStopReplayClick = useCallback(() => {
      stopTrainingAudio();
      setIsReplayLoading(false);
    }, []);

    const handleVoiceAnswerClick = useCallback(() => {
      if (typeof window === 'undefined') return;

      const speechWindow = window as TrainingSpeechRecognitionWindow;
      const RecognitionClass = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

      if (!RecognitionClass) return;

      if (isVoiceListening) {
        speechRecognitionRef.current?.stop();
        setIsVoiceListening(false);
        return;
      }

      const recognition = new RecognitionClass();
      speechRecognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'ru-RU';

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript?.trim())
          .filter((item): item is string => !!item && item.length > 0)
          .join(' ')
          .trim();

        if (transcript.length > 0) {
          setVoiceLastTranscript(transcript);
          setIsSubmittingAnswer(true);
          void sendMessage({ message: transcript });
        }
      };

      recognition.onerror = () => {
        setIsVoiceListening(false);
      };
      recognition.onend = () => {
        setIsVoiceListening(false);
      };

      setIsVoiceListening(true);
      recognition.start();
    }, [isVoiceListening, sendMessage]);

    const handleReactionClick = useCallback(
      (emoji: string) => {
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing && existing.users.includes(userId)) {
          removeReaction(id, emoji);
        } else {
          addReaction(id, emoji);
        }
      },
      [addReaction, id, reactions, removeReaction, userId],
    );

    const isLatestTrainingMessage = id === latestAssistantMessageId && isTrainingFlowMessage;
    const isRoundListening = isVoiceListening || isReplayLoading || !!activeTrainingAudio;
    const isRoundReview = generating || isSubmittingAnswer;
    const roundStage: 'listen' | 'respond' | 'review' = isRoundListening
      ? 'listen'
      : isRoundReview
        ? 'review'
        : 'respond';

    const isActive = useCallback(
      (emoji: string) => {
        const reaction = reactions.find((r) => r.emoji === emoji);
        return !!reaction && reaction.users.includes(userId);
      },
      [reactions, userId],
    );

    useEffect(() => {
      if (id !== latestAssistantMessageId || !isTrainingFlowMessage) return;
      const resetTimeout = window.setTimeout(() => {
        setRoundTimeLeft(30);
        setIsSubmittingAnswer(false);
        setSelectedOptionKey(null);
      }, 0);

      return () => {
        window.clearTimeout(resetTimeout);
      };
    }, [id, isTrainingFlowMessage, latestAssistantMessageId]);

    useEffect(() => {
      if (!isLatestTrainingMessage) return;
      if (roundStage !== 'respond') return;
      if (roundTimeLeft <= 0) return;

      const timerId = window.setTimeout(() => {
        setRoundTimeLeft((value) => Math.max(0, value - 1));
      }, 1000);

      return () => {
        window.clearTimeout(timerId);
      };
    }, [isLatestTrainingMessage, roundStage, roundTimeLeft]);

    useEffect(() => {
      if (!isSubmittingAnswer) return;
      if (generating) return;
      if (!isLatestTrainingMessage) return;

      const timeout = window.setTimeout(() => {
        setIsSubmittingAnswer(false);
      }, 600);

      return () => {
        window.clearTimeout(timeout);
      };
    }, [generating, isLatestTrainingMessage, isSubmittingAnswer]);

    useEffect(() => {
      if (!isTrainingFlowMessage || generating) return;
      if (!trainingSpeechText) return;
      if (id !== latestAssistantMessageId) return;
      if (lastAutoPlayedMessageId === id) return;

      void playTrainingSpeech(trainingSpeechText);
      lastAutoPlayedMessageId = id;
    }, [
      generating,
      id,
      isTrainingFlowMessage,
      latestAssistantMessageId,
      playTrainingSpeech,
      trainingSpeechText,
    ]);

    useEffect(() => {
      if (!isTrainingFlowMessage) return;
      if (id !== latestAssistantMessageId) return;
      if (options.length === 0) return;
      if (typeof window === 'undefined') return;

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName?.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) return;

        const key = event.key.toUpperCase();
        const option = options.find((item) => item.key === key);
        if (!option) return;

        event.preventDefault();
        void handleOptionClick(option);
      };

      window.addEventListener('keydown', onKeyDown);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
      };
    }, [handleOptionClick, id, isTrainingFlowMessage, latestAssistantMessageId, options]);

    useEffect(
      () => () => {
        speechRecognitionRef.current?.stop();
      },
      [],
    );

    const handleInsertOnPage = useCallback(() => {
      if (!insertOnPageContext) return;
      const editor = insertOnPageContext.getEditor();
      if (!editor) {
        messageApi.warning(t('pageEditor.editorNotReady', { ns: 'file' }));
        return;
      }
      const text = (content || '').trim();
      if (!text) return;
      try {
        const current = (editor.getDocument('markdown') as unknown as string) || '';
        const newContent = current.trim() ? `${current}\n\n${text}` : text;
        editor.setDocument('markdown', newContent);
        messageApi.success(t('pageEditor.insertSuccess', { ns: 'file' }));
        editor.focus?.();
      } catch (err) {
        console.error('[insertOnPage]', err);
        messageApi.error(t('pageEditor.insertError', { ns: 'file' }));
      }
    }, [content, insertOnPageContext, messageApi, t]);

    const showInsertOnPage =
      context?.scope === 'page' &&
      !!insertOnPageContext &&
      !generating &&
      !!(content || '').trim();

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
        {showInsertOnPage && (
          <Flexbox justify={'flex-end'} style={INSERT_ON_PAGE_BUTTON_STYLE}>
            <Button size={'small'} type={'primary'} onClick={handleInsertOnPage}>
              {t('messageAction.insertOnPage', { defaultValue: 'Вставить на страницу' })}
            </Button>
          </Flexbox>
        )}
        {(options.length > 0 || score !== null) && (
          <Flexbox gap={8}>
            {isLatestTrainingMessage && (
              <Block style={ROUND_PANEL_STYLE} variant={'outlined'}>
                <Flexbox gap={6}>
                  <Flexbox horizontal justify={'space-between'}>
                    <Text style={{ color: '#0f766e', fontWeight: 700 }}>Раунд</Text>
                    <Text fontSize={12} type={'secondary'}>
                      {roundStage === 'listen'
                        ? 'Слушаем'
                        : roundStage === 'review'
                          ? 'Разбор'
                          : 'Отвечаем'}
                    </Text>
                  </Flexbox>
                  <Text
                    fontSize={12}
                    style={{ color: roundTimeLeft <= 5 ? '#dc2626' : '#0f766e', fontWeight: 600 }}
                  >
                    {roundTimeLeft > 0
                      ? `${RU.timer}: ${roundTimeLeft}с`
                      : `${RU.timerExpired}. ${RU.answerByVoice.toLowerCase()} или выберите вариант`}
                  </Text>
                  <Flexbox horizontal style={{ gap: 6 }}>
                    {(['listen', 'respond', 'review'] as const).map((step) => (
                      <Block
                        key={step}
                        style={{
                          backgroundColor: step === roundStage ? '#14b8a6' : '#ccfbf1',
                          borderRadius: 999,
                          color: step === roundStage ? '#ffffff' : '#0f766e',
                          fontSize: 12,
                          padding: '2px 10px',
                        }}
                      >
                        {step === 'listen' ? 'Слушаем' : step === 'respond' ? 'Отвечаем' : 'Разбор'}
                      </Block>
                    ))}
                  </Flexbox>
                </Flexbox>
              </Block>
            )}
            <Flexbox horizontal gap={8} style={{ flexWrap: 'wrap' }}>
              <Button
                loading={isReplayLoading}
                size={'small'}
                style={TURQUOISE_BUTTON_STYLE}
                variant={'filled'}
                onClick={handleReplayClick}
              >
                Play
              </Button>
              <Button
                disabled={!activeTrainingAudio}
                size={'small'}
                style={TURQUOISE_BUTTON_STYLE}
                variant={'filled'}
                onClick={handleStopReplayClick}
              >
                Stop
              </Button>
              <Button
                disabled={voiceSupport === 'unsupported'}
                size={'small'}
                style={TURQUOISE_BUTTON_STYLE}
                variant={'filled'}
                onClick={handleVoiceAnswerClick}
              >
                {isVoiceListening ? RU.stopRecording : RU.answerByVoice}
              </Button>
            </Flexbox>
            <Text fontSize={12} type={'secondary'}>
              {voiceSupport === 'unsupported'
                ? RU.noVoiceSupport
                : isVoiceListening
                  ? RU.listening
                  : RU.hotkeysHint}
            </Text>
            {voiceLastTranscript && (
              <Text fontSize={12} style={{ color: '#0f766e' }}>
                {`${RU.recognized}: ${voiceLastTranscript}`}
              </Text>
            )}
            {options.map((option) => (
              <Block
                key={`${id}-${option.raw}`}
                variant={'outlined'}
                style={{
                  ...OPTION_BLOCK_STYLE,
                  border:
                    selectedOptionKey === option.key ? '2px solid #0f766e' : OPTION_BLOCK_STYLE.border,
                  boxShadow:
                    selectedOptionKey === option.key
                      ? '0 0 0 3px rgba(20, 184, 166, 0.15)'
                      : 'none',
                }}
              >
                <Flexbox gap={6}>
                  <Flexbox horizontal align={'center'} justify={'space-between'}>
                    <Text style={{ color: '#0f766e', fontWeight: 700 }}>{`${RU.variant} ${option.key}`}</Text>
                    <Button
                      size={'small'}
                      style={TURQUOISE_BUTTON_STYLE}
                      variant={'filled'}
                      onClick={() => {
                        void handleOptionClick(option);
                      }}
                    >
                      {`${RU.choose} (${option.key})`}
                    </Button>
                  </Flexbox>
                  <Text fontSize={14} style={{ color: '#0f172a', lineHeight: 1.5 }}>
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
                  {`${RU.score}: ${score}`}
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
