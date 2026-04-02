import { trainingKnowledgeEntries } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { getSessionAdminUser } from '@/server/utils/admin';

interface KnowledgePayload {
  attackMyth?: string | null;
  id?: string | null;
  officialUsp?: string | null;
  productIngredient?: string | null;
  scenarioId?: string | null;
}

const ensureAdminSession = async () => {
  return getSessionAdminUser();
};

const requireText = (value: unknown, field: string) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`Поле ${field} обязательно`);
  return text;
};

export async function POST(req: NextRequest) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = (await req.json().catch(() => ({}))) as KnowledgePayload;
    const scenarioId = requireText(body.scenarioId, 'scenarioId');
    const productIngredient = requireText(body.productIngredient, 'productIngredient');
    const officialUsp = requireText(body.officialUsp, 'officialUsp');
    const attackMyth = requireText(body.attackMyth, 'attackMyth');

    const [created] = await serverDB
      .insert(trainingKnowledgeEntries)
      .values({ attackMyth, officialUsp, productIngredient, scenarioId })
      .returning();

    return NextResponse.json({ entry: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось добавить запись';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = (await req.json().catch(() => ({}))) as KnowledgePayload;
    const id = requireText(body.id, 'id');
    const patch: Record<string, string | Date> = { updatedAt: new Date() };

    if (typeof body.productIngredient === 'string' && body.productIngredient.trim()) {
      patch.productIngredient = body.productIngredient.trim();
    }
    if (typeof body.officialUsp === 'string' && body.officialUsp.trim()) {
      patch.officialUsp = body.officialUsp.trim();
    }
    if (typeof body.attackMyth === 'string' && body.attackMyth.trim()) {
      patch.attackMyth = body.attackMyth.trim();
    }

    const [updated] = await serverDB
      .update(trainingKnowledgeEntries)
      .set(patch)
      .where(eq(trainingKnowledgeEntries.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
    }

    return NextResponse.json({ entry: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось обновить запись';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Параметр id обязателен' }, { status: 400 });
  }

  try {
    const [deleted] = await serverDB
      .delete(trainingKnowledgeEntries)
      .where(eq(trainingKnowledgeEntries.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
    }

    return NextResponse.json({ entry: deleted });
  } catch (error) {
    console.error('[admin/training/knowledge] failed to delete:', error);
    return NextResponse.json({ error: 'Не удалось удалить запись' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
