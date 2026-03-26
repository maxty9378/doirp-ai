'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { FileTextIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import {
  loadLocalVoiceCallSessions,
  type LocalVoiceCallSession,
  removeLocalVoiceCallSession,
} from '@/utils/voiceCallLocalSessions';

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

function formatDate(iso: string): string {
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
          debugLog: session.debugLog ?? null,
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

const SessionList = memo(() => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scenarioTitles, setScenarioTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

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
          setSessions(
            local.map(mapLocalToListItem).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
          );
          setError('Не удалось загрузить сессии с сервера. Показаны локальные данные.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = useCallback(
    (id: string) => () => {
      navigate(`/voice-call/sessions/${id}`);
    },
    [navigate],
  );

  if (loading) {
    return <SkeletonList paddingBlock={8} />;
  }

  if (error && sessions.length === 0) {
    return (
      <Flexbox padding={12}>
        <Text style={{ fontSize: 12, color: 'var(--colorError)' }}>{error}</Text>
      </Flexbox>
    );
  }

  if (sessions.length === 0) {
    return (
      <Flexbox padding={12}>
        <Text style={{ fontSize: 13, color: 'var(--colorTextSecondary)' }}>
          Пока нет сохранённых сессий
        </Text>
      </Flexbox>
    );
  }

  return (
    <Flexbox gap={1} paddingBlock={4} paddingInline={4}>
      {error && (
        <Flexbox paddingBlock={6} paddingInline={8}>
          <Text style={{ fontSize: 12, color: 'var(--colorWarning)' }}>{error}</Text>
        </Flexbox>
      )}
      {sessions.map((session) => (
        <NavItem
          icon={FileTextIcon}
          key={session.id}
          title={
            <Flexbox gap={2} style={{ overflow: 'hidden' }}>
              <Text ellipsis style={{ fontSize: 13, fontWeight: 500 }}>
                {getScenarioTitle(session.scenarioId)}
              </Text>
              <Text style={{ fontSize: 11, color: 'var(--colorTextTertiary)' }}>
                {formatDate(session.createdAt)}
                {session.overallScore != null && ` | ${Math.round(session.overallScore)}%`}
                {session.isLocal && ' | локально'}
              </Text>
            </Flexbox>
          }
          onClick={handleClick(session.id)}
        />
      ))}
    </Flexbox>
  );
});

SessionList.displayName = 'VoiceCallSessionList';

export default SessionList;
