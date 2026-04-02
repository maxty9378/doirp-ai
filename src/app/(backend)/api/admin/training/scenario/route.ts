import { trainingScenarios } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { getTrainingScenarioWithKnowledge } from '@/server/services/training';
import { getSessionAdminUser } from '@/server/utils/admin';

interface ScoreLevelLabels {
  high?: string;
  low?: string;
  mid?: string;
}

interface ScenarioUpdatePayload {
  analyzePrompt?: string | null;
  assistantLabel?: string | null;
  autoSuccessPrompt?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  checkpointIds?: string[] | null;
  contextWindow?: number | null;
  debriefPrompt?: string | null;
  description?: string | null;
  enableCheckpoints?: boolean | null;
  enableScoring?: boolean | null;
  goals?: string[] | null;
  introDialogButtonLabel?: string | null;
  introDialogDescription?: string | null;
  introDialogHint?: string | null;
  introDialogPlaceholder?: string | null;
  introDialogTitle?: string | null;
  isActive?: boolean | null;
  key?: string | null;
  legend?: string | null;
  openingInstruction?: string | null;
  quietSpeakerNudge?: string | null;
  roundEndingPrompt?: string | null;
  scoreDisplayLabel?: string | null;
  scoreLevelLabels?: ScoreLevelLabels | null;
  sessionDurationMs?: number | null;
  shortAnswerNudge?: string | null;
  showIntroDialog?: boolean | null;
  showLegend?: boolean | null;
  silenceHardHangupMs?: number | null;
  silenceNudgeAfterMs?: number | null;
  silenceNudgeCooldownMs?: number | null;
  silenceNudgePhrases?: string[] | null;
  silenceNudgeTemplate?: string | null;
  systemPrompt?: string | null;
  title?: string | null;
  userLabel?: string | null;
  userRole?: string | null;
  voiceName?: string | null;
}

const ensureAdminSession = async () => {
  return getSessionAdminUser();
};

const normalizeStringList = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  return value.map((item) => String(item || '').trim()).filter(Boolean);
};

export async function GET(req: NextRequest) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const key = req.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'Параметр key обязателен' }, { status: 400 });
  }

  try {
    const payload = await getTrainingScenarioWithKnowledge(key);
    if (!payload) {
      return NextResponse.json({ error: 'Тренажёр не найден' }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[admin/training/scenario] failed to load:', error);
    return NextResponse.json({ error: 'Не удалось загрузить тренажёр' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as ScenarioUpdatePayload;
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) {
    return NextResponse.json({ error: 'Параметр key обязателен' }, { status: 400 });
  }

  const goals = normalizeStringList(body.goals);
  const checkpointIds = normalizeStringList(body.checkpointIds);
  const silencePhrases = normalizeStringList(body.silenceNudgePhrases);

  const scoreLevelLabels =
    body.scoreLevelLabels && typeof body.scoreLevelLabels === 'object'
      ? {
          high: body.scoreLevelLabels.high?.trim() || undefined,
          low: body.scoreLevelLabels.low?.trim() || undefined,
          mid: body.scoreLevelLabels.mid?.trim() || undefined,
        }
      : null;

  const patch: ScenarioUpdatePayload & { updatedAt: Date } = {
    analyzePrompt: body.analyzePrompt?.trim() || null,
    assistantLabel: body.assistantLabel?.trim() || null,
    avatarUrl: body.avatarUrl?.trim() || null,
    bannerUrl: body.bannerUrl?.trim() || null,
    checkpointIds,
    debriefPrompt: body.debriefPrompt?.trim() || null,
    contextWindow: typeof body.contextWindow === 'number' ? body.contextWindow : null,
    description: body.description?.trim() || null,
    enableCheckpoints: body.enableCheckpoints ?? null,
    enableScoring: body.enableScoring ?? null,
    goals,
    introDialogButtonLabel: body.introDialogButtonLabel?.trim() || null,
    introDialogDescription: body.introDialogDescription?.trim() || null,
    introDialogHint: body.introDialogHint?.trim() || null,
    introDialogPlaceholder: body.introDialogPlaceholder?.trim() || null,
    introDialogTitle: body.introDialogTitle?.trim() || null,
    isActive: body.isActive ?? null,
    legend: body.legend?.trim() || null,
    openingInstruction: body.openingInstruction?.trim() || null,
    showIntroDialog: body.showIntroDialog ?? null,
    roundEndingPrompt: body.roundEndingPrompt?.trim() || null,
    silenceNudgeTemplate: body.silenceNudgeTemplate?.trim() || null,
    shortAnswerNudge: body.shortAnswerNudge?.trim() || null,
    quietSpeakerNudge: body.quietSpeakerNudge?.trim() || null,
    autoSuccessPrompt: body.autoSuccessPrompt?.trim() || null,
    scoreDisplayLabel: body.scoreDisplayLabel?.trim() || null,
    scoreLevelLabels,
    showLegend: body.showLegend ?? null,
    sessionDurationMs: typeof body.sessionDurationMs === 'number' ? body.sessionDurationMs : null,
    silenceHardHangupMs:
      typeof body.silenceHardHangupMs === 'number' ? body.silenceHardHangupMs : null,
    silenceNudgeAfterMs:
      typeof body.silenceNudgeAfterMs === 'number' ? body.silenceNudgeAfterMs : null,
    silenceNudgeCooldownMs:
      typeof body.silenceNudgeCooldownMs === 'number' ? body.silenceNudgeCooldownMs : null,
    silenceNudgePhrases: silencePhrases,
    systemPrompt: body.systemPrompt?.trim() || null,
    title: body.title?.trim() || null,
    updatedAt: new Date(),
    userLabel: body.userLabel?.trim() || null,
    userRole: body.userRole?.trim() || null,
    voiceName: body.voiceName?.trim() || null,
  };

  try {
    const [updated] = await serverDB
      .update(trainingScenarios)
      .set(
        Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<
          typeof trainingScenarios.$inferInsert
        >,
      )
      .where(eq(trainingScenarios.key, key))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Тренажёр не найден' }, { status: 404 });
    }

    return NextResponse.json({ scenario: updated });
  } catch (error) {
    console.error('[admin/training/scenario] failed to update:', error);
    return NextResponse.json({ error: 'Не удалось сохранить тренажёр' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
