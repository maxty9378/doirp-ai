import {
  agents,
  messages,
  trainingScenarios,
  users,
  voiceCallSessions,
} from '@lobechat/database/schemas';
import { and, desc, eq, ilike, isNotNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { VOICE_CALL_PRESETS } from '@/config/initialAgents';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';

interface TrainingResultItem {
  agentId: string;
  agentTitle: string;
  completedAt: Date;
  employeeName: string;
  finalScore: number;
  userId: string;
}

const SCORE_TAG_REGEX = /\[CURRENT_SCORE:\s*(-?\d+)\]/g;

const parseLastScore = (content?: string | null): number | null => {
  if (!content) return null;

  let lastMatch: RegExpExecArray | null = null;
  for (const match of content.matchAll(SCORE_TAG_REGEX)) {
    lastMatch = match;
  }

  if (!lastMatch?.[1]) return null;

  const score = Number.parseInt(lastMatch[1], 10);
  return Number.isNaN(score) ? null : score;
};

const setLatestTrainingResult = (
  latestByUserAndAgent: Map<string, TrainingResultItem>,
  item: TrainingResultItem,
) => {
  const mapKey = `${item.userId}:${item.agentId}`;
  const existing = latestByUserAndAgent.get(mapKey);
  if (existing && existing.completedAt >= item.completedAt) return;

  latestByUserAndAgent.set(mapKey, item);
};

const ensureAdmin = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user as { email?: string; username?: string } | undefined;
  const username = user?.username;
  const email = user?.email?.toLowerCase();

  const byUsername = username === ADMIN_USERNAME;
  const byEmail = ADMIN_EMAIL && email === ADMIN_EMAIL.toLowerCase();

  if (!byUsername && !byEmail) return null;

  return session;
};

/**
 * GET /api/training-results
 * Admin-only endpoint that returns the latest training score per (userId, agentId).
 * Voice-call trainers read score from voice_call_sessions; legacy text trainers fall back to
 * assistant messages with [CURRENT_SCORE: X].
 */
export async function GET() {
  const session = await ensureAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const latestByUserAndAgent = new Map<string, TrainingResultItem>();

    const voiceRows = await serverDB
      .select({
        createdAt: voiceCallSessions.createdAt,
        fullName: users.fullName,
        scenarioId: voiceCallSessions.scenarioId,
        scenarioTitle: trainingScenarios.title,
        score: voiceCallSessions.score,
        userEmail: users.email,
        userId: voiceCallSessions.userId,
        username: users.username,
      })
      .from(voiceCallSessions)
      .innerJoin(users, eq(voiceCallSessions.userId, users.id))
      .leftJoin(trainingScenarios, eq(voiceCallSessions.scenarioId, trainingScenarios.key))
      .where(isNotNull(voiceCallSessions.score))
      .orderBy(desc(voiceCallSessions.createdAt));

    for (const row of voiceRows) {
      if (row.score === null) continue;

      setLatestTrainingResult(latestByUserAndAgent, {
        agentId: row.scenarioId,
        agentTitle:
          row.scenarioTitle ||
          VOICE_CALL_PRESETS[row.scenarioId]?.title ||
          row.scenarioId ||
          'Untitled Agent',
        completedAt: row.createdAt,
        employeeName: row.fullName || row.username || row.userEmail || row.userId,
        finalScore: row.score,
        userId: row.userId,
      });
    }

    const legacyRows = await serverDB
      .select({
        agentId: messages.agentId,
        agentTitle: agents.title,
        content: messages.content,
        createdAt: messages.createdAt,
        fullName: users.fullName,
        userEmail: users.email,
        userId: messages.userId,
        username: users.username,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .leftJoin(agents, eq(messages.agentId, agents.id))
      .where(
        and(
          eq(messages.role, 'assistant'),
          isNotNull(messages.agentId),
          ilike(messages.content, '%[CURRENT_SCORE:%'),
        ),
      )
      .orderBy(desc(messages.createdAt));

    for (const row of legacyRows) {
      if (!row.agentId) continue;

      const score = parseLastScore(row.content);
      if (score === null) continue;

      setLatestTrainingResult(latestByUserAndAgent, {
        agentId: row.agentId,
        agentTitle: row.agentTitle || 'Untitled Agent',
        completedAt: row.createdAt,
        employeeName: row.fullName || row.username || row.userEmail || row.userId,
        finalScore: score,
        userId: row.userId,
      });
    }

    return NextResponse.json({
      results: Array.from(latestByUserAndAgent.values()).sort(
        (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
      ),
    });
  } catch (error) {
    console.error('Error fetching training results:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
