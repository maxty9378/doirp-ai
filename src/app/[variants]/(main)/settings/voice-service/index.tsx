'use client';

import { Avatar, Flexbox, Markdown } from '@lobehub/ui';
import { App, Button, Input } from 'antd';
import { createStyles } from 'antd-style';
import type { MutableRefObject, ReactElement, ReactNode } from 'react';
import {
  createContext,
  useCallback,
  cloneElement,
  useContext,
  useEffect,
  Fragment,
  isValidElement,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import PageTitle from '@/components/PageTitle';
import SettingHeader from '@/app/[variants]/(main)/settings/features/SettingHeader';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import WideScreenButton from '@/features/WideScreenContainer/WideScreenButton';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { markdownToTxt } from '@/utils/markdownToTxt';
import {
  countWords,
  getCurrentWordIndex,
  splitTextToTokens,
} from '@/app/[variants]/(main)/settings/voice-service/utils';

const TTS_API = '/webapi/tts/google';
const DEFAULT_VOICE = 'Charon';
const SAMPLE_TEXT = 'Это пример голоса. ДОиРП АИ — генерируем будущее!';
const SAMPLE_VARIANTS = ['variant1', 'variant2', 'variant3', 'variant4'] as const;
const getSampleUrl = (voiceName: string, variantKey: string) =>
  `/tts-samples/${voiceName.toLowerCase()}-${variantKey}.wav`;
const VOICE_IDS = ['Kore', 'Charon'] as const;

const useStyles = createStyles(({ css, token }) => ({
  marker: css`
    background: linear-gradient(transparent 55%, ${token.colorPrimaryBg} 55%);
    border-radius: 3px;
    box-decoration-break: clone;
    padding: 0 2px;
  `,
  generatingCard: css`
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 16px;
    padding: 24px;
    background: linear-gradient(135deg, ${token.colorFillQuaternary}, ${token.colorBgContainer});
    position: relative;
    overflow: hidden;
  `,
  generatingGlow: css`
    position: absolute;
    inset: -30% 0 auto 0;
    height: 120%;
    background: radial-gradient(circle at 50% 30%, ${token.colorPrimaryBg}, transparent 60%);
    opacity: 0.7;
    animation: voiceServiceGlow 2.6s ease-in-out infinite;

    @keyframes voiceServiceGlow {
      0% {
        transform: translateY(-10px);
      }
      50% {
        transform: translateY(6px);
      }
      100% {
        transform: translateY(-10px);
      }
    }
  `,
  generatingTitle: css`
    font-size: 16px;
    font-weight: 600;
    position: relative;
  `,
  generatingDesc: css`
    color: ${token.colorTextSecondary};
    font-size: 13px;
    margin-top: 6px;
    position: relative;
  `,
  generatingDots: css`
    display: inline-flex;
    gap: 6px;
    margin-top: 12px;
    position: relative;

    span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${token.colorPrimary};
      opacity: 0.4;
      animation: voiceServiceDots 1.1s ease-in-out infinite;
    }

    span:nth-of-type(2) {
      animation-delay: 0.15s;
    }

    span:nth-of-type(3) {
      animation-delay: 0.3s;
    }

    @keyframes voiceServiceDots {
      0%,
      100% {
        transform: translateY(0);
        opacity: 0.3;
      }
      50% {
        transform: translateY(-6px);
        opacity: 1;
      }
    }
  `,
  generatingFooter: css`
    color: ${token.colorTextTertiary};
    font-size: 12px;
    margin-top: 12px;
    position: relative;
  `,
}));

type WordHighlightContextValue = {
  currentWordIndex: number;
  markerClassName: string;
  wordCounter: MutableRefObject<number>;
};

const WordHighlightContext = createContext<WordHighlightContextValue | null>(null);

const renderHighlightedText = (rawText: string, ctx: WordHighlightContextValue): ReactNode => {
  if (!rawText) return null;
  if (ctx.currentWordIndex < 0) return null;

  const tokens = splitTextToTokens(rawText);
  return tokens.map((token, index) => {
    if (!token.isWord) {
      if (ctx.wordCounter.current === 0) return null;
      if (ctx.wordCounter.current > ctx.currentWordIndex + 1) return null;
      return <span key={`sep-${index}`}>{token.text}</span>;
    }

    const wordIndex = ctx.wordCounter.current;
    ctx.wordCounter.current += 1;
    if (wordIndex > ctx.currentWordIndex) return null;

    return (
      <span
        className={wordIndex === ctx.currentWordIndex ? ctx.markerClassName : undefined}
        key={`word-${index}`}
      >
        {token.text}
      </span>
    );
  });
};

const renderHighlightedChildren = (children: ReactNode, ctx: WordHighlightContextValue): ReactNode => {
  if (children == null || typeof children === 'boolean') return children;

  if (typeof children === 'string' || typeof children === 'number') {
    return renderHighlightedText(String(children), ctx);
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <Fragment key={`chunk-${index}`}>{renderHighlightedChildren(child, ctx)}</Fragment>
    ));
  }

  if (isValidElement(children)) {
    if (children.type === 'code') return children;
    const element = children as ReactElement<{ children?: ReactNode }>;
    return cloneElement(element, {
      children: renderHighlightedChildren(element.props.children, ctx),
    });
  }

  return children;
};

type HighlightableTag = 'p' | 'li' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

const HighlightWrapper = ({
  as: Component,
  children,
  ...rest
}: {
  as: HighlightableTag;
  children?: ReactNode;
  [key: string]: unknown;
}) => {
  const ctx = useContext(WordHighlightContext);
  if (!ctx) return <Component {...rest}>{children}</Component>;

  return <Component {...rest}>{renderHighlightedChildren(children, ctx)}</Component>;
};

const VoiceServicePage = () => {
  const { t } = useTranslation('setting');
  const { modal } = App.useApp();
  const { styles } = useStyles();
  const isAdmin = useIsAdmin();
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [view, setView] = useState<'edit' | 'player' | 'generating'>('edit');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const [sampleLoadingVoice, setSampleLoadingVoice] = useState<string | null>(null);
  const [samplePrefetching, setSamplePrefetching] = useState<Record<string, boolean>>({});
  const [samplePrefetchError, setSamplePrefetchError] = useState<Record<string, boolean>>({});
  const [sampleReady, setSampleReady] = useState<Record<string, boolean>>({});
  const sampleAbortControllers = useRef<Record<string, AbortController>>({});
  const wordCounterRef = useRef(0);

  const trimmedText = text.trim();
  const canClear = text.length > 0 || !!audioUrl;

  const stopSample = useCallback(() => {
    if (sampleAudioRef.current) {
      sampleAudioRef.current.pause();
      sampleAudioRef.current.currentTime = 0;
      sampleAudioRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      stopSample();
    };
  }, [audioUrl, stopSample]);

  const resetAudio = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setCurrentWordIndex(-1);
  }, [audioUrl]);

  const plainText = useMemo(() => markdownToTxt(trimmedText), [trimmedText]);
  const wordTokens = useMemo(() => splitTextToTokens(plainText), [plainText]);
  const totalWords = useMemo(() => countWords(wordTokens), [wordTokens]);

  wordCounterRef.current = 0;
  const highlightContextValue = useMemo(
    () => ({
      currentWordIndex,
      markerClassName: styles.marker,
      wordCounter: wordCounterRef,
    }),
    [currentWordIndex, styles.marker],
  );

  const markdownComponents = useMemo(
    () => ({
      p: ({ node, ...props }: { node?: unknown; children?: ReactNode }) => (
        <HighlightWrapper as="p" {...props} />
      ),
      li: ({ node, ...props }: { node?: unknown; children?: ReactNode }) => (
        <HighlightWrapper as="li" {...props} />
      ),
      h1: ({ node, ...props }: { node?: unknown; children?: ReactNode }) => (
        <HighlightWrapper as="h1" {...props} />
      ),
      h2: ({ node, ...props }: { node?: unknown; children?: ReactNode }) => (
        <HighlightWrapper as="h2" {...props} />
      ),
      h3: ({ node, ...props }: { node?: unknown; children?: ReactNode }) => (
        <HighlightWrapper as="h3" {...props} />
      ),
      h4: ({ node, ...props }: { node?: unknown; children?: ReactNode }) => (
        <HighlightWrapper as="h4" {...props} />
      ),
      h5: ({ node, ...props }: { node?: unknown; children?: ReactNode }) => (
        <HighlightWrapper as="h5" {...props} />
      ),
      h6: ({ node, ...props }: { node?: unknown; children?: ReactNode }) => (
        <HighlightWrapper as="h6" {...props} />
      ),
    }),
    [],
  );

  const updateHighlightedWord = useCallback(() => {
    const el = audioRef.current;
    if (!el || totalWords === 0) return;
    if (el.paused && el.currentTime === 0) {
      setCurrentWordIndex(-1);
      return;
    }
    const index = getCurrentWordIndex(el.currentTime, el.duration, totalWords);
    if (index === -1) return;
    setCurrentWordIndex(index);
  }, [totalWords]);

  const handlePlay = useCallback(() => {
    updateHighlightedWord();
  }, [updateHighlightedWord]);

  const handleTimeUpdate = useCallback(() => {
    updateHighlightedWord();
  }, [updateHighlightedWord]);

  const handleSeeked = useCallback(() => {
    updateHighlightedWord();
  }, [updateHighlightedWord]);

  const handleLoadedMetadata = useCallback(() => {
    updateHighlightedWord();
  }, [updateHighlightedWord]);

  const handleEnded = useCallback(() => {
    if (totalWords > 0) setCurrentWordIndex(totalWords - 1);
  }, [totalWords]);

  const handleOzvuchit = async () => {
    if (!isAdmin) {
      modal.info({
        centered: true,
        content: t('voiceService.adminOnly.desc', {
          defaultValue:
            'Функция озвучки доступна только администраторам. Если вам нужен доступ, обратитесь к администратору вашей организации.',
        }),
        okText: t('voiceService.adminOnly.action', { defaultValue: 'Понятно' }),
        title: t('voiceService.adminOnly.title', { defaultValue: 'Доступ ограничен' }),
      });
      return;
    }
    if (!trimmedText) {
      setError(t('voiceService.errors.emptyText', { defaultValue: 'Введите текст для озвучки' }));
      return;
    }
    setError(null);
    setLoading(true);
    setCurrentWordIndex(-1);
    stopSample();
    resetAudio();
    setView('generating');
    try {
      const voiceName = voice.trim();
      const res = await fetch(TTS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmedText,
          ...(voiceName ? { voice: voiceName } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setView('player');
      setTimeout(() => {
        audioRef.current?.play?.().catch((e) => {
          setError(
            e?.message ||
              t('voiceService.errors.playback', { defaultValue: 'Не удалось воспроизвести аудио' }),
          );
        });
      }, 100);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('voiceService.errors.synthesis', { defaultValue: 'Не удалось озвучить текст' }),
      );
      setView('edit');
    } finally {
      setLoading(false);
    }
  };

  const playSampleFromUrl = useCallback(
    async (url: string) => {
      stopSample();
      audioRef.current?.pause();
      const audio = new Audio(url);
      sampleAudioRef.current = audio;
      audio.onended = () => {
        stopSample();
      };
      audio.onerror = () => {
        stopSample();
      };
      await audio.play();
    },
    [stopSample],
  );

  const makeSampleKey = useCallback((voiceName: string, variantKey: string) => {
    return `${voiceName}:${variantKey}`;
  }, []);

  const handlePlaySample = useCallback(
    async (voiceOverride?: string) => {
      const variantKey =
        SAMPLE_VARIANTS[Math.floor(Math.random() * SAMPLE_VARIANTS.length)];
      const voiceName = (voiceOverride || voice.trim() || DEFAULT_VOICE).trim();
      const sampleKey = makeSampleKey(voiceName, variantKey);
      const url = getSampleUrl(voiceName, variantKey);
      stopSample();
      setSampleLoadingVoice(sampleKey);
      try {
        await playSampleFromUrl(url);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : t('voiceService.errors.sample', { defaultValue: 'Не удалось проиграть пример' }),
        );
      } finally {
        setSampleLoadingVoice(null);
      }
    },
    [makeSampleKey, playSampleFromUrl, stopSample, t, voice],
  );

  useEffect(() => {
    let mounted = true;
    const prefetch = async (voiceName: string, variantKey: string) => {
      const sampleKey = makeSampleKey(voiceName, variantKey);
      if (sampleReady[sampleKey]) return;
      setSamplePrefetching((prev) => ({ ...prev, [sampleKey]: true }));
      setSamplePrefetchError((prev) => ({ ...prev, [sampleKey]: false }));
      const controller = new AbortController();
      sampleAbortControllers.current[sampleKey] = controller;
      try {
        const url = getSampleUrl(voiceName, variantKey);
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(res.statusText);
        await res.blob();
        if (!mounted) {
          return;
        }
        setSampleReady((prev) => ({ ...prev, [sampleKey]: true }));
      } catch {
        if (mounted) {
          setSamplePrefetchError((prev) => ({ ...prev, [sampleKey]: true }));
        }
      } finally {
        if (mounted) {
          setSamplePrefetching((prev) => ({ ...prev, [sampleKey]: false }));
        }
      }
    };

    VOICE_IDS.forEach((voiceName) => {
      SAMPLE_VARIANTS.forEach((variantKey) => {
        void prefetch(voiceName, variantKey);
      });
    });

    return () => {
      mounted = false;
      Object.values(sampleAbortControllers.current).forEach((controller) => controller.abort());
      sampleAbortControllers.current = {};
    };
  }, []);

  const handleClear = useCallback(() => {
    setText('');
    setError(null);
    setCurrentWordIndex(-1);
    resetAudio();
    setView('edit');
  }, [resetAudio]);

  const handleDownload = useCallback(() => {
    if (!audioUrl) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = 'voice-service.mp3';
    link.click();
  }, [audioUrl]);

  const handleEdit = useCallback(() => {
    setView('edit');
    setCurrentWordIndex(-1);
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  }, []);

  const voiceOptions = [
    {
      avatar: '/voice-avatars/lyumira.png',
      id: 'Kore',
      description: t('voiceService.voices.kore.desc', {
        defaultValue: 'Нейтральный тембр',
      }),
      title: t('voiceService.voices.kore.name', { defaultValue: 'Люмира' }),
    },
    {
      avatar: '/voice-avatars/severin.png',
      id: 'Charon',
      description: t('voiceService.voices.charon.desc', {
        defaultValue: 'Уверенный тембр',
      }),
      title: t('voiceService.voices.charon.name', { defaultValue: 'Северин' }),
    },
  ];

  return (
    <>
      <PageTitle title={t('tab.voiceService')} />
      <NavHeader right={<WideScreenButton />} />
      <Flexbox height={'100%'} style={{ overflowY: 'auto', paddingBottom: '16vh' }} width={'100%'}>
        <WideScreenContainer>
          <Flexbox gap={16} paddingBlock={24} style={{ maxWidth: 720, width: '100%' }}>
            <SettingHeader title={t('tab.voiceService')} />
            <Flexbox gap={16} style={{ maxWidth: 640 }}>
              {view === 'edit' ? (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                      {t('voiceService.inputLabel', { defaultValue: 'Текст для озвучки' })}
                    </label>
                    <Input.TextArea
                      autoSize={{ minRows: 4, maxRows: 12 }}
                      onChange={(e) => {
                        setText(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder={t('voiceService.input.placeholder', {
                        defaultValue: 'Вставьте или введите текст для озвучки.',
                      })}
                      value={text}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                      {t('voiceService.voiceLabel', { defaultValue: 'Голос' })}
                    </label>
                    <Flexbox gap={8}>
                      {voiceOptions.map((item) => {
                        const isSelected = voice === item.id;
                        return (
                          <div
                            key={item.id}
                            style={{
                              background: 'var(--colorBgContainer)',
                              border: isSelected
                                ? '1px solid var(--colorPrimary)'
                                : '1px solid transparent',
                              borderRadius: 10,
                              padding: 12,
                            }}
                          >
                            <Flexbox align={'center'} horizontal justify={'space-between'}>
                              <Flexbox align={'center'} gap={12} horizontal>
                                <Avatar avatar={item.avatar} size={40} />
                                <div>
                                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                                  <div style={{ color: 'var(--colorTextSecondary)', fontSize: 12 }}>
                                    {item.description}
                                  </div>
                                </div>
                              </Flexbox>
                              <Flexbox gap={8} horizontal>
                                <Button
                                  onClick={() => setVoice(item.id)}
                                  size="middle"
                                  type={isSelected ? 'primary' : 'default'}
                                >
                                  {isSelected
                                    ? t('voiceService.actions.selected', { defaultValue: 'Выбрано' })
                                    : t('voiceService.actions.select', { defaultValue: 'Выбрать' })}
                                </Button>
                                {(() => {
                                  const prefix = `${item.id}:`;
                                  const isLoading =
                                    (sampleLoadingVoice && sampleLoadingVoice.startsWith(prefix)) ||
                                    SAMPLE_VARIANTS.some(
                                      (variant) =>
                                        !!samplePrefetching[makeSampleKey(item.id, variant)],
                                    );
                                  const hasError = SAMPLE_VARIANTS.some(
                                    (variant) =>
                                      !!samplePrefetchError[makeSampleKey(item.id, variant)],
                                  );
                                  return (
                                    <Button
                                      loading={isLoading}
                                      onClick={() => handlePlaySample(item.id)}
                                      size="middle"
                                    >
                                      {hasError
                                        ? t('voiceService.actions.retrySample', {
                                            defaultValue: 'Повторить',
                                          })
                                        : t('voiceService.actions.sample', {
                                            defaultValue: 'Прослушать пример',
                                          })}
                                    </Button>
                                  );
                                })()}
                              </Flexbox>
                            </Flexbox>
                          </div>
                        );
                      })}
                    </Flexbox>
                    <div style={{ color: 'var(--colorTextSecondary)', fontSize: 12, marginTop: 8 }}>
                      {t('voiceService.sampleText', { defaultValue: SAMPLE_TEXT })}
                    </div>
                  </div>
                  <Flexbox gap={8} horizontal>
                    <Button
                      disabled={loading || trimmedText.length === 0}
                      loading={loading}
                      onClick={handleOzvuchit}
                      size="large"
                      type="primary"
                    >
                      {t('voiceService.button', { defaultValue: 'Озвучить' })}
                    </Button>
                    <Button disabled={loading || !canClear} onClick={handleClear} size="large">
                      {t('voiceService.actions.clear', { defaultValue: 'Очистить' })}
                    </Button>
                    <Button disabled={!audioUrl} onClick={handleDownload} size="large">
                      {t('voiceService.actions.download', { defaultValue: 'Скачать аудио' })}
                    </Button>
                  </Flexbox>
                </>
              ) : view === 'generating' ? (
                <>
                  <Flexbox gap={12}>
                    <div style={{ fontWeight: 600 }}>
                      {t('voiceService.generating.title', {
                        defaultValue: 'ИИ генерирует озвучку',
                      })}
                    </div>
                    <div className={styles.generatingCard}>
                      <div className={styles.generatingGlow} />
                      <div className={styles.generatingTitle}>
                        {t('voiceService.generating.caption', { defaultValue: 'Готовим аудио' })}
                      </div>
                      <div className={styles.generatingDesc}>
                        {t('voiceService.generating.desc', {
                          defaultValue: 'Обычно это занимает несколько секунд.',
                        })}
                      </div>
                      <div className={styles.generatingDots}>
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className={styles.generatingFooter}>
                        {t('voiceService.generating.note', {
                          defaultValue: 'Плеер появится автоматически.',
                        })}
                      </div>
                    </div>
                  </Flexbox>
                </>
              ) : (
                <>
                  <Flexbox gap={8}>
                    <Flexbox align={'center'} horizontal justify={'space-between'}>
                      <div style={{ fontWeight: 600 }}>
                        {t('voiceService.playerLabel', { defaultValue: 'Текст озвучки' })}
                      </div>
                      <Button onClick={handleEdit} size="middle">
                        {t('voiceService.actions.edit', { defaultValue: 'Изменить текст' })}
                      </Button>
                    </Flexbox>
                    {audioUrl && (
                      <audio
                        ref={audioRef}
                        controls
                        onEnded={handleEnded}
                        onLoadedMetadata={handleLoadedMetadata}
                        onPlay={handlePlay}
                        onSeeked={handleSeeked}
                        onTimeUpdate={handleTimeUpdate}
                        src={audioUrl}
                        style={{ width: '100%' }}
                      />
                    )}
                    <div
                      style={{
                        background: 'var(--colorBgContainer)',
                        borderRadius: 10,
                        padding: 16,
                      }}
                    >
                      <WordHighlightContext.Provider value={highlightContextValue}>
                        <Markdown
                          animated
                          components={markdownComponents}
                          enableStream
                          style={{ overflow: 'unset' }}
                          variant={'chat'}
                        >
                          {trimmedText}
                        </Markdown>
                      </WordHighlightContext.Provider>
                    </div>
                  </Flexbox>
                </>
              )}
              {error && <div style={{ color: 'var(--colorError)', fontSize: 14 }}>{error}</div>}
            </Flexbox>
          </Flexbox>
        </WideScreenContainer>
      </Flexbox>
    </>
  );
};

export default VoiceServicePage;
