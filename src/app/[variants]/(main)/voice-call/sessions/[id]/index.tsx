'use client';

import { Button, Spin } from 'antd';
import { createStaticStyles } from 'antd-style';
import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
    overflow: hidden;
    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;
    min-height: 0;

    background: ${cssVar.colorBgLayout};
  `,
  header: css`
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;

    padding-block: 16px;
    padding-inline: 24px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  title: css`
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  subtitle: css`
    margin-block: 4px 0;
    margin-inline: 0;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  reportScroll: css`
    overflow: hidden auto;
    flex: 1;
  `,
  reportWrap: css`
    width: 100%;
    max-width: 1200px;
    margin-block: 0;
    margin-inline: auto;
    padding: 24px;
  `,
  localBadge: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;

    padding-block: 2px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
}));

interface SessionDetail {
  analysisResult: {
    overallScore: number;
    competencies: Array<{ name: string; score: number }>;
    summary: string;
    strengths: string[];
    improvements: string[];
    recommendedAction?: string;
    phraseFeedback: Array<{
      userPhrase: string;
      suggestedPhrase: string;
      advice: string;
    }>;
  } | null;
  createdAt: string;
  id: string;
  isLocal?: boolean;
  scenarioId: string;
  speakerName?: string;
  transcript: Array<{ role: 'ai' | 'user'; text: string }>;
}

const VoiceCallSessionDetailPage = memo(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
        throw new Error('??? ???????? ????????? ? ???????????');
      }

      const analyzeRes = await fetch('/api/voice-call/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptForApi, scenarioId: session.scenarioId }),
        credentials: 'include',
      });
      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || '?????? ???????');
      }
      const analysisResult = await analyzeRes.json();

      if (isLocalSession) {
        const updated = { ...session, analysisResult };
        saveLocalVoiceCallSession({
          id: session.id,
          scenarioId: session.scenarioId,
          transcript: session.transcript,
          analysisResult,
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
        throw new Error('?? ??????? ????????? ????????? ???????');
      }

      setSession((prev) => (prev ? { ...prev, analysisResult } : prev));
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : '??????');
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
      setError('?????? ?? ???????');
      setIsLocalSession(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/voice-call/sessions/${id}`, { credentials: 'include' })
      .then((res) => {
        if (res.status === 404) throw new Error('?????? ?? ???????');
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data: SessionDetail) => {
        if (!cancelled) setSession(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '?????? ????????');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className={styles.root}>
        <div style={{ color: 'var(--colorTextSecondary)' }}>?? ?????? id ??????.</div>
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/voice-call/sessions')}>
          ? ?????? ??????
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={styles.root}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className={styles.root}>
        <div style={{ color: 'var(--colorError)', marginBottom: 16 }}>
          {error ?? '?????? ?? ???????'}
        </div>
        <Button onClick={() => navigate('/voice-call/sessions')}>? ?????? ??????</Button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{getScenarioTitle(session.scenarioId)}</h1>
          <p className={styles.subtitle}>{formatSessionDate(session.createdAt)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {session.isLocal && <span className={styles.localBadge}>????????</span>}
          <Button onClick={() => navigate('/voice-call/sessions')}>? ?????? ??????</Button>
          <Button type="primary" onClick={() => navigate('/voice-call')}>
            ? ?????????
          </Button>
        </div>
      </header>

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
              <div style={{ color: 'var(--colorTextSecondary)', fontSize: 15 }}>
                {session.transcript.length > 0
                  ? '?????? ?? ??? ???????? ??? ???? ??????. ?????????? ???????? ? ????? ????????? ?????? ??????.'
                  : '?????????? ???? ? ?????? ??????????.'}
              </div>
              {session.transcript.length > 0 && (
                <>
                  <Button
                    loading={retryLoading}
                    size="large"
                    type="primary"
                    onClick={retryAnalysis}
                  >
                    {retryLoading ? '???????????...' : '????????? ??????'}
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
});

VoiceCallSessionDetailPage.displayName = 'VoiceCallSessionDetailPage';
export default VoiceCallSessionDetailPage;
