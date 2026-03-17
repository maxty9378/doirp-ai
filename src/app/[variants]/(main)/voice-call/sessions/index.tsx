'use client';

import { createStaticStyles } from 'antd-style';
import { Button, Card, List, Spin } from 'antd';
import { memo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 24px;
    background: ${cssVar.colorBgLayout};
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 24px;
  `,
  title: css`
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  card: css`
    margin-bottom: 12px;
    cursor: pointer;
    transition: box-shadow 0.2s, border-color 0.2s;
    &:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      border-color: ${cssVar.colorPrimaryBorder};
    }
  `,
}));

interface SessionListItem {
  id: string;
  scenarioId: string;
  overallScore: number | null;
  score: number | null;
  hangUpReason?: string;
  durationSeconds?: number;
  createdAt: string;
}

const VoiceCallSessionsPage = memo(() => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/voice-call/sessions?limit=50', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data: { sessions?: SessionListItem[] }) => {
        if (!cancelled) setSessions(data.sessions ?? []);
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
  }, []);

  const formatDate = (iso: string) => {
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
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>Мои сессии тренажёра</h1>
        <Button type="primary" onClick={() => navigate('/voice-call')}>
          К тренажёру
        </Button>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--colorError)', marginBottom: 16 }}>{error}</div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div style={{ color: 'var(--colorTextSecondary)', padding: 24 }}>
          Пока нет сохранённых сессий. Завершите звонок в тренажёре — результат появится здесь.
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <List
          dataSource={sessions}
          renderItem={(item) => (
            <List.Item style={{ border: 'none', padding: 0, marginBottom: 12 }}>
              <Card
                className={styles.card}
                size="small"
                onClick={() => navigate(`/voice-call/sessions/${item.id}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      Сценарий: {item.scenarioId}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--colorTextSecondary)' }}>
                      {formatDate(item.createdAt)}
                      {item.durationSeconds != null && (
                        <span style={{ marginLeft: 12 }}>
                          Длительность: {Math.floor(item.durationSeconds / 60)} мин
                        </span>
                      )}
                    </div>
                  </div>
                  {item.overallScore != null && (
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color:
                          item.overallScore >= 70
                            ? 'var(--colorSuccess)'
                            : item.overallScore >= 40
                              ? 'var(--colorWarning)'
                              : 'var(--colorError)',
                      }}
                    >
                      {Math.round(item.overallScore)}%
                    </span>
                  )}
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}
    </div>
  );
});

VoiceCallSessionsPage.displayName = 'VoiceCallSessionsPage';
export default VoiceCallSessionsPage;
