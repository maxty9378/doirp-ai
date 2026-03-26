import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getTrainingScenarioWithKnowledge } from '@/server/services/training';
import {
  planTrainingTurn,
  type TrainingTurnPlannerState,
  type TrainingTurnTranscriptEntry,
} from '@/server/services/training/turnPlanner';

const DEFAULT_TRAINING_AGENT_ID = 'training-gfd-stress';

interface PlanTurnBody {
  agentId?: string;
  previousState?: TrainingTurnPlannerState | null;
  transcript?: TrainingTurnTranscriptEntry[];
}

const isTranscriptEntry = (value: unknown): value is TrainingTurnTranscriptEntry => {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return (
    (record.role === 'ai' || record.role === 'user') &&
    typeof record.text === 'string' &&
    record.text.trim().length > 0
  );
};

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as PlanTurnBody;
    const agentId = body.agentId || DEFAULT_TRAINING_AGENT_ID;
    const transcript = Array.isArray(body.transcript) ? body.transcript.filter(isTranscriptEntry) : [];

    if (transcript.length === 0) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 });
    }

    const trainingScenario = await getTrainingScenarioWithKnowledge(agentId).catch((dbError) => {
      console.warn('[voice-call/plan-turn] Training scenario from DB failed:', dbError);
      return null;
    });

    if (!trainingScenario) {
      return NextResponse.json(
        { error: 'Сценарий тренажёра не найден в базе данных.' },
        { status: 404 },
      );
    }

    const plan = planTrainingTurn({
      knowledgeEntries: trainingScenario.knowledgeEntries,
      previousState: body.previousState ?? null,
      transcript,
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error('[voice-call/plan-turn] error', error);

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
