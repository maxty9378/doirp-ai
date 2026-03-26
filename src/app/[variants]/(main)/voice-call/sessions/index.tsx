'use client';

import { Button, Card, List, Spin } from 'antd';
import { createStaticStyles } from 'antd-style';
import { memo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  loadLocalVoiceCallSessions,
  type LocalVoiceCallSession,
  removeLocalVoiceCallSession,
} from '@/utils/voiceCallLocalSessions';

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    width: 100%;
    max-width: 900px;
    margin-block: 0;
    margin-inline: auto;
    padding: 24px;

    background: ${cssVar.colorBgLayout};
  `,
  header: css`
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 24px;
  `,
  title: css`
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  card: css`
    cursor: pointer;
    margin-block-end: 12px;
    transition:
      box-shadow 0.2s,
      border-color 0.2s;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
      box-shadow: 0 4px 12px rgb(0 0 0 / 8%);
    }
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

interface SessionListItem {
  createdAt: string;
  durationSeconds?: number;
  hangUpReason?: string;
  id: string;
  isLocal?: boolean;
  overallScore: number | null;
  scenarioId: string;
  score: number | null;
}

const mapLocalToListItem = (session: LocalVoiceCallSession): SessionListItem => ({
  id: session.id,
  scenarioId: session.scenarioId,
  overallScore: session.analysisResult?.overallScore ?? session.score ?? null,
  score: session.score ?? null,
  hangUpReason: session.hangUpReason,
  durationSeconds: session.durationSeconds,
  createdAt: session.createdAt,
  isLocal: true,
});

const mergeSessions = (
  server: SessionListItem[],
  local: LocalVoiceCallSession[],
): SessionListItem[] => {
  const localMapped = local.map(mapLocalToListItem);
  const ids = new Set(server.map((s) => s.id));
  const merged = [...server, ...localMapped.filter((s) => !ids.has(s.id))];
  return merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
};

const syncLocalSessions = async (local: LocalVoiceCallSession[]) => {
  if (local.length === 0) return;
  for (const session of local) {
    try {
      const res = await fetch('/api/voice-call/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: session.scenarioId,
          transcript: session.transcript,
          analysisResult: session.analysisResult ?? null,
          durationSeconds: session.durationSeconds,
          speakerName: session.speakerName,
          score: session.score ?? null,
          hangUpReason: session.hangUpReason,
        }),
        credentials: 'include',
      });
      if (res.ok) removeLocalVoiceCallSession(session.id);
    } catch {
      // keep local session for retry
    }
  }
};

const VoiceCallSessionsPage = memo(() => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const localSeed = loadLocalVoiceCallSessions();
    if (localSeed.length > 0) {
      setSessions(
        localSeed.map(mapLocalToListItem).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      );
    }

    fetch('/api/voice-call/sessions?limit=50', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data: { sessions?: SessionListItem[] }) => {
        if (cancelled) return;
        const serverSessions = data.sessions ?? [];
        const local = loadLocalVoiceCallSessions();
        const merged = mergeSessions(serverSessions, local);
        setSessions(merged);
        void syncLocalSessions(local);
      })
      .catch(() => {
        if (!cancelled) {
          const local = loadLocalVoiceCallSessions();
          setSessions(local.map(mapLocalToListItem));
          setError('?? ??????? ????????? ??????. ????????? ???????????.');
        }
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
        <h1 className={styles.title}>??? ?????? ?????????</h1>
        <Button type="primary" onClick={() => navigate('/voice-call')}>
          ? ?????????
        </Button>
      </div>

      {error && <div style={{ color: 'var(--colorError)', marginBottom: 16 }}>{error}</div>}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div style={{ color: 'var(--colorTextSecondary)', padding: 24 }}>
          ???? ??? ??????????? ??????. ????????? ?????? ? ????????? ? ????????? ???????? ?????.
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      ????????: {item.scenarioId}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--colorTextSecondary)' }}>
                      {formatDate(item.createdAt)}
                      {item.durationSeconds != null && (
                        <span style={{ marginLeft: 12 }}>
                          ????????????: {Math.floor(item.durationSeconds / 60)} ???
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {item.isLocal && <span className={styles.localBadge}>????????</span>}
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
