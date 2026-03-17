'use client';

import { createStaticStyles } from 'antd-style';
import { Button, Spin } from 'antd';
import { memo, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import PostCallReport from '../../features/GeminiLiveCall/PostCallReport';

/** Отображаемые названия сценариев по ключу (как в сайдбаре) */
const SCENARIO_TITLES: Record<string, string> = {
  'training-gfd-stress': 'GFD: Стресс‑интервью на выставке',
};

function getScenarioTitle(scenarioId: string): string {
  return SCENARIO_TITLES[scenarioId] ?? scenarioId;
}

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
    background: ${cssVar.colorBgLayout};
    overflow: hidden;
  `,
  header: css`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    padding: 16px 24px;
    border-bottom: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorBgContainer};
  `,
  title: css`
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  subtitle: css`
    margin: 4px 0 0 0;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  reportScroll: css`
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  `,
  reportWrap: css`
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  `,
}));

interface SessionDetail {
  id: string;
  scenarioId: string;
  transcript: Array<{ role: 'ai' | 'user'; text: string }>;
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
}

const VoiceCallSessionDetailPage = memo(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/voice-call/sessions/${id}`, { credentials: 'include' })
      .then((res) => {
        if (res.status === 404) throw new Error('Сессия не найдена');
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

  if (!id) {
    return (
      <div className={styles.root}>
        <div style={{ color: 'var(--colorTextSecondary)' }}>Не указан id сессии.</div>
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/voice-call/sessions')}>
          К списку сессий
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.root} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className={styles.root}>
        <div style={{ color: 'var(--colorError)', marginBottom: 16 }}>{error ?? 'Сессия не найдена'}</div>
        <Button onClick={() => navigate('/voice-call/sessions')}>К списку сессий</Button>
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
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => navigate('/voice-call/sessions')}>К списку сессий</Button>
          <Button type="primary" onClick={() => navigate('/voice-call')}>
            К тренажёру
          </Button>
        </div>
      </header>

      <div className={styles.reportScroll}>
        <div className={styles.reportWrap}>
          {session.analysisResult ? (
            <PostCallReport data={session.analysisResult} />
          ) : (
            <div style={{ color: 'var(--colorTextSecondary)' }}>
              Результат анализа для этой сессии недоступен.
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

VoiceCallSessionDetailPage.displayName = 'VoiceCallSessionDetailPage';
export default VoiceCallSessionDetailPage;
