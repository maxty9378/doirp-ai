'use client';

import { ChatHeader } from '@lobehub/ui/mobile';
import { Button, Spin } from 'antd';
import { createStaticStyles } from 'antd-style';
import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { mobileHeaderSticky } from '@/styles/mobileHeader';
import {
  getLocalVoiceCallSession,
  LOCAL_SESSION_PREFIX,
  saveLocalVoiceCallSession,
} from '@/utils/voiceCallLocalSessions';

import PostCallReport from '../../features/GeminiLiveCall/PostCallReport';

function formatSessionDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: ${cssVar.colorBgLayout};
  `,
  mobileHeader: css`
    flex-shrink: 0;
    border-bottom: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorBgContainer};
  `,
  header: css`
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorBgContainer};

    @media (width <= 640px) {
      flex-direction: column;
      align-items: stretch;
      padding: 12px;
    }
  `,
  title: css`
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  subtitle: css`
    margin: 4px 0 0;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  reportScroll: css`
    overflow: hidden auto;
    flex: 1;
    min-height: 0;
  `,
  reportWrap: css`
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;

    @media (width <= 640px) {
      padding: 16px 12px calc(env(safe-area-inset-bottom, 0px) + 24px);
    }
  `,
  localBadge: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
    background: ${cssVar.colorFillSecondary};
  `,
  actions: css`
    display: flex;
    gap: 8px;
    align-items: center;

    @media (width <= 640px) {
      flex-direction: column;
      align-items: stretch;
    }
  `,
  messageWrap: css`
    padding: 24px;

    @media (width <= 640px) {
      padding: 16px 12px;
    }
  `,
}));

interface SessionDetail {
  analysisResult: {
    competencies: Array<{ name: string; score: number }>;
    improvements: string[];
    overallScore: number;
    phraseFeedback: Array<{
      advice: string;
      suggestedPhrase: string;
      userPhrase: string;
    }>;
    recommendedAction?: string;
    strengths: string[];
    summary: string;
  } | null;
  createdAt: string;
  debugLog?: {
    agentId: string;
    events: Array<{ at: string; data?: Record<string, unknown>; type: string }>;
    status: string;
  } | null;
  id: string;
  isLocal?: boolean;
  scenarioId: string;
  speakerName?: string;
  transcript: Array<{ role: 'ai' | 'user'; text: string }>;
}

type AnalyzeSessionResponse = NonNullable<SessionDetail['analysisResult']> & {
  normalizedTranscript?: SessionDetail['transcript'];
};

export interface VoiceCallSessionDetailPageProps {
  layoutMode?: 'desktop' | 'mobile';
}

export const VoiceCallSessionDetailPage = memo<VoiceCallSessionDetailPageProps>(
  ({ layoutMode = 'desktop' }) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isMobileLayout = layoutMode === 'mobile';
    const [session, setSession] = useState<SessionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scenarioTitles, setScenarioTitles] = useState<Record<string, string>>({});
    const [retryLoading, setRetryLoading] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);
    const [isLocalSession, setIsLocalSession] = useState(false);

    useEffect(() => {
      fetch('/api/training/scenarios', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { scenarios: [] }))
        .then((data: { scenarios?: Array<{ key: string; title: string }> }) => {
          const map: Record<string, string> = {};
          for (const s of data.scenarios ?? []) {
            map[s.key] = s.title;
          }
          setScenarioTitles(map);
        })
        .catch(() => {});
    }, []);

    const getScenarioTitle = useCallback(
      (scenarioId: string) => scenarioTitles[scenarioId] ?? scenarioId,
      [scenarioTitles],
    );

    const retryAnalysis = useCallback(async () => {
      if (!session || !id || retryLoading) return;
      setRetryLoading(true);
      setRetryError(null);
      try {
        const transcriptForApi = session.transcript.filter(
          (e) => typeof e?.text === 'string' && e.text.trim().length > 0,
        );
        if (transcriptForApi.length === 0) {
          throw new Error('Нет доступной транскрипции для анализа.');
        }

        const analyzeRes = await fetch('/api/voice-call/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: transcriptForApi, scenarioId: session.scenarioId }),
          credentials: 'include',
        });
        if (!analyzeRes.ok) {
          const errData = await analyzeRes.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || 'Ошибка анализа');
        }
        const analysisPayload = (await analyzeRes.json()) as AnalyzeSessionResponse;
        const nextTranscript = Array.isArray(analysisPayload.normalizedTranscript)
          ? analysisPayload.normalizedTranscript
          : session.transcript;
        const { normalizedTranscript: _normalizedTranscript, ...analysisResult } = analysisPayload;

        if (isLocalSession) {
          const updated = { ...session, analysisResult, transcript: nextTranscript };
          saveLocalVoiceCallSession({
            id: session.id,
            scenarioId: session.scenarioId,
            transcript: nextTranscript,
            analysisResult,
            debugLog: session.debugLog ?? null,
            score: analysisResult?.overallScore ?? null,
            hangUpReason: undefined,
            durationSeconds: undefined,
            speakerName: session.speakerName,
            createdAt: session.createdAt,
            localOnly: true,
          });
          setSession(updated);
          return;
        }

        const patchRes = await fetch(`/api/voice-call/sessions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysisResult }),
          credentials: 'include',
        });
        if (!patchRes.ok) {
          throw new Error('Не удалось сохранить результат анализа.');
        }

        setSession((prev) => (prev ? { ...prev, analysisResult, transcript: nextTranscript } : prev));
      } catch (e) {
        setRetryError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        setRetryLoading(false);
      }
    }, [session, id, retryLoading, isLocalSession]);

    useEffect(() => {
      if (!id) {
        setLoading(false);
        return;
      }

      if (id.startsWith(LOCAL_SESSION_PREFIX)) {
        const local = getLocalVoiceCallSession(id);
        if (local) {
          setSession({
            id: local.id,
            scenarioId: local.scenarioId,
            transcript: local.transcript,
            analysisResult: local.analysisResult ?? null,
            createdAt: local.createdAt,
            speakerName: local.speakerName,
            isLocal: true,
          });
          setIsLocalSession(true);
          setLoading(false);
          return;
        }
        setError('Сессия не найдена.');
        setIsLocalSession(true);
        setLoading(false);
        return;
      }

      let cancelled = false;
      setLoading(true);
      setError(null);
      fetch(`/api/voice-call/sessions/${id}`, { credentials: 'include' })
        .then((res) => {
          if (res.status === 404) throw new Error('Сессия не найдена.');
          if (!res.ok) throw new Error(res.statusText);
          return res.json();
        })
        .then((data: SessionDetail) => {
          if (!cancelled) setSession(data);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [id]);

    const sessionTitle = session ? getScenarioTitle(session.scenarioId) : 'Сессия тренажёра';

    if (!id) {
      return (
        <div className={styles.root}>
          {isMobileLayout && (
            <div className={styles.mobileHeader}>
              <ChatHeader
                showBackButton
                center={<ChatHeader.Title title={<span style={{ lineHeight: 1.2 }}>Сессия</span>} />}
                style={mobileHeaderSticky}
                onBackClick={() => navigate('/voice-call/sessions')}
              />
            </div>
          )}
          <div className={styles.messageWrap}>
            <div style={{ color: 'var(--colorTextSecondary)' }}>Не указан идентификатор сессии.</div>
            <Button block={isMobileLayout} style={{ marginTop: 16 }} onClick={() => navigate('/voice-call/sessions')}>
              К списку сессий
            </Button>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className={styles.root}>
          {isMobileLayout && (
            <div className={styles.mobileHeader}>
              <ChatHeader
                showBackButton
                center={<ChatHeader.Title title={<span style={{ lineHeight: 1.2 }}>Сессия</span>} />}
                style={mobileHeaderSticky}
                onBackClick={() => navigate('/voice-call/sessions')}
              />
            </div>
          )}
          <div
            style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Spin size="large" />
          </div>
        </div>
      );
    }

    if (error || !session) {
      return (
        <div className={styles.root}>
          {isMobileLayout && (
            <div className={styles.mobileHeader}>
              <ChatHeader
                showBackButton
                center={<ChatHeader.Title title={<span style={{ lineHeight: 1.2 }}>Сессия</span>} />}
                style={mobileHeaderSticky}
                onBackClick={() => navigate('/voice-call/sessions')}
              />
            </div>
          )}
          <div className={styles.messageWrap}>
            <div style={{ color: 'var(--colorError)', marginBottom: 16 }}>
              {error ?? 'Сессия не найдена.'}
            </div>
            <Button block={isMobileLayout} onClick={() => navigate('/voice-call/sessions')}>
              К списку сессий
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.root}>
        {isMobileLayout && (
          <div className={styles.mobileHeader}>
            <ChatHeader
              showBackButton
              center={<ChatHeader.Title title={<span style={{ lineHeight: 1.2 }}>{sessionTitle}</span>} />}
              style={mobileHeaderSticky}
              onBackClick={() => navigate('/voice-call/sessions')}
            />
          </div>
        )}

        {!isMobileLayout && (
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>{sessionTitle}</h1>
              <p className={styles.subtitle}>{formatSessionDate(session.createdAt)}</p>
            </div>
            <div className={styles.actions}>
              {session.isLocal && <span className={styles.localBadge}>Локально</span>}
              <Button onClick={() => navigate('/voice-call/sessions')}>К списку сессий</Button>
              <Button type="primary" onClick={() => navigate('/voice-call')}>
                Новый звонок
              </Button>
            </div>
          </header>
        )}

        {isMobileLayout && (
          <div className={styles.header}>
            <div>
              <p className={styles.subtitle} style={{ marginTop: 0 }}>
                {formatSessionDate(session.createdAt)}
              </p>
            </div>
            <div className={styles.actions}>
              {session.isLocal && <span className={styles.localBadge}>Локально</span>}
              <Button block onClick={() => navigate('/voice-call')}>
                Новый звонок
              </Button>
            </div>
          </div>
        )}

        <div className={styles.reportScroll}>
          <div className={styles.reportWrap}>
            {session.analysisResult ? (
              <PostCallReport
                data={session.analysisResult}
                speakerName={session.speakerName}
                transcript={session.transcript}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  padding: '40px 0',
                }}
              >
                <div style={{ color: 'var(--colorTextSecondary)', fontSize: 15, textAlign: 'center' }}>
                  {session.transcript.length > 0
                    ? 'Для этой сессии ещё нет готового анализа. Можно запустить повторный разбор по сохранённой транскрипции.'
                    : 'Транскрипция для этой сессии отсутствует.'}
                </div>
                {session.transcript.length > 0 && (
                  <>
                    <Button
                      block={isMobileLayout}
                      loading={retryLoading}
                      size="large"
                      type="primary"
                      onClick={retryAnalysis}
                    >
                      {retryLoading ? 'Анализируем...' : 'Запустить анализ'}
                    </Button>
                    {retryError && (
                      <div style={{ color: 'var(--colorError)', fontSize: 13 }}>{retryError}</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);

VoiceCallSessionDetailPage.displayName = 'VoiceCallSessionDetailPage';

export default VoiceCallSessionDetailPage;
