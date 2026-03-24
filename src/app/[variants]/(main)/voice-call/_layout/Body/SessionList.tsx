'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { FileTextIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';


interface SessionListItem {
  id: string;
  scenarioId: string;
  overallScore: number | null;
  score: number | null;
  hangUpReason?: string;
  durationSeconds?: number;
  createdAt: string;
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

const SessionList = memo(() => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scenarioTitles, setScenarioTitles] = useState<Record<string, string>>({});

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
    fetch('/api/voice-call/sessions?limit=50', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { sessions: [] }))
      .then((data: { sessions?: SessionListItem[] }) => {
        if (!cancelled) setSessions(data.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
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

  if (sessions.length === 0) {
    return (
      <Flexbox padding={12}>
        <Text style={{ fontSize: 13, color: 'var(--colorTextSecondary)' }}>
          Нет сохранённых сессий
        </Text>
      </Flexbox>
    );
  }

  return (
    <Flexbox gap={1} paddingBlock={4} paddingInline={4}>
      {sessions.map((session) => (
        <NavItem
          key={session.id}
          icon={FileTextIcon}
          onClick={handleClick(session.id)}
          title={
            <Flexbox gap={2} style={{ overflow: 'hidden' }}>
              <Text ellipsis style={{ fontSize: 13, fontWeight: 500 }}>
                {getScenarioTitle(session.scenarioId)}
              </Text>
              <Text style={{ fontSize: 11, color: 'var(--colorTextTertiary)' }}>
                {formatDate(session.createdAt)}
                {session.overallScore != null && ` · ${Math.round(session.overallScore)}%`}
              </Text>
            </Flexbox>
          }
        />
      ))}
    </Flexbox>
  );
});

SessionList.displayName = 'VoiceCallSessionList';

export default SessionList;
