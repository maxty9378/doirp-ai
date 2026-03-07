import { and, count, desc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';

import type { DocumentItem, DocumentRevisionItem, NewDocument, NewDocumentRevision } from '../schemas';
import { documentRevisions, documents } from '../schemas';
import type { LobeChatDatabase } from '../type';

export interface QueryDocumentParams {
  current?: number;
  fileTypes?: string[];
  pageSize?: number;
  sourceTypes?: string[];
}

export class DocumentModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  create = async (params: Omit<NewDocument, 'userId'>): Promise<DocumentItem> => {
    const result = (await this.db
      .insert(documents)
      .values({ ...params, userId: this.userId })
      .returning()) as DocumentItem[];

    return result[0]!;
  };

  /** Soft-delete (archive): set deleted_at. Document stays in DB until purged after 24h. */
  delete = async (id: string) => {
    return this.db
      .update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.userId, this.userId), isNull(documents.deletedAt)));
  };

  /** Permanently remove a document (e.g. after 24h in archive). Use with care. */
  hardDelete = async (id: string) => {
    return this.db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, this.userId)));
  };

  deleteAll = async () => {
    return this.db
      .update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documents.userId, this.userId), isNull(documents.deletedAt)));
  };

  query = async ({
    current = 0,
    pageSize = 9999,
    fileTypes,
    sourceTypes,
  }: QueryDocumentParams = {}): Promise<{
    items: DocumentItem[];
    total: number;
  }> => {
    const offset = current * pageSize;
    const conditions = [eq(documents.userId, this.userId), isNull(documents.deletedAt)];

    if (fileTypes?.length) {
      conditions.push(inArray(documents.fileType, fileTypes));
    }

    if (sourceTypes?.length) {
      conditions.push(inArray(documents.sourceType, sourceTypes as ('file' | 'web' | 'api')[]));
    }

    const whereCondition = and(...conditions);

    // Fetch items and total count in parallel
    // Optimize: Exclude large JSONB fields (content, pages, editorData) for better performance
    const [rawItems, totalResult] = await Promise.all([
      this.db
        .select({
          accessedAt: documents.accessedAt,
          clientId: documents.clientId,
          createdAt: documents.createdAt,
          fileId: documents.fileId,
          fileType: documents.fileType,
          filename: documents.filename,
          id: documents.id,
          metadata: documents.metadata,
          parentId: documents.parentId,
          slug: documents.slug,
          source: documents.source,
          sourceType: documents.sourceType,
          title: documents.title,
          totalCharCount: documents.totalCharCount,
          totalLineCount: documents.totalLineCount,
          updatedAt: documents.updatedAt,
          userId: documents.userId,
          // Exclude large fields: content, pages, editorData
        })
        .from(documents)
        .where(whereCondition)
        .orderBy(desc(documents.updatedAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: count(documents.id) })
        .from(documents)
        .where(whereCondition),
    ]);

    // Map to DocumentItem type with excluded fields as null
    const items = rawItems.map((item) => ({
      ...item,
      content: null,
      editorData: null,
      pages: null,
    })) as DocumentItem[];

    return { items, total: totalResult[0].count };
  };

  /** List only soft-deleted (archived) documents for the current user. */
  queryDeleted = async ({
    current = 0,
    pageSize = 50,
    fileTypes,
    sourceTypes,
  }: QueryDocumentParams = {}): Promise<{ items: DocumentItem[]; total: number }> => {
    const offset = current * pageSize;
    const conditions = [eq(documents.userId, this.userId), isNotNull(documents.deletedAt)];

    if (fileTypes?.length) {
      conditions.push(inArray(documents.fileType, fileTypes));
    }
    if (sourceTypes?.length) {
      conditions.push(inArray(documents.sourceType, sourceTypes as ('file' | 'web' | 'api')[]));
    }

    const whereCondition = and(...conditions);

    const [rawItems, totalResult] = await Promise.all([
      this.db
        .select({
          accessedAt: documents.accessedAt,
          clientId: documents.clientId,
          createdAt: documents.createdAt,
          deletedAt: documents.deletedAt,
          fileId: documents.fileId,
          fileType: documents.fileType,
          filename: documents.filename,
          id: documents.id,
          metadata: documents.metadata,
          parentId: documents.parentId,
          slug: documents.slug,
          source: documents.source,
          sourceType: documents.sourceType,
          title: documents.title,
          totalCharCount: documents.totalCharCount,
          totalLineCount: documents.totalLineCount,
          updatedAt: documents.updatedAt,
          userId: documents.userId,
        })
        .from(documents)
        .where(whereCondition)
        .orderBy(desc(documents.deletedAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ count: count(documents.id) }).from(documents).where(whereCondition),
    ]);

    const items = rawItems.map((item) => ({
      ...item,
      content: null,
      editorData: null,
      pages: null,
    })) as DocumentItem[];

    return { items, total: totalResult[0].count };
  };

  findById = async (id: string): Promise<DocumentItem | undefined> => {
    return this.db.query.documents.findFirst({
      where: and(
        eq(documents.userId, this.userId),
        eq(documents.id, id),
        isNull(documents.deletedAt),
      ),
    });
  };

  findByFileId = async (fileId: string) => {
    return this.db.query.documents.findFirst({
      where: and(eq(documents.userId, this.userId), eq(documents.fileId, fileId)),
    });
  };

  findBySlug = async (slug: string): Promise<DocumentItem | undefined> => {
    return this.db.query.documents.findFirst({
      where: and(eq(documents.userId, this.userId), eq(documents.slug, slug)),
    });
  };

  update = async (id: string, value: Partial<DocumentItem>) => {
    return this.db
      .update(documents)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(documents.userId, this.userId), eq(documents.id, id)));
  };

  /** Restore a soft-deleted document (clear deleted_at). */
  restore = async (id: string) => {
    return this.db
      .update(documents)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.userId, this.userId), isNotNull(documents.deletedAt)));
  };

  /** Permanently delete documents that were soft-deleted before cutoff (e.g. 24h ago). */
  purgeDeletedOlderThan = async (cutoff: Date): Promise<number> => {
    const result = await this.db
      .delete(documents)
      .where(
        and(eq(documents.userId, this.userId), isNotNull(documents.deletedAt), lt(documents.deletedAt, cutoff)),
      );
    return result.rowCount ?? 0;
  };

  // ============ Revisions ============

  createRevision = async (params: Omit<NewDocumentRevision, 'userId'>): Promise<DocumentRevisionItem> => {
    const result = (await this.db
      .insert(documentRevisions)
      .values({ ...params, userId: this.userId })
      .returning()) as DocumentRevisionItem[];

    return result[0]!;
  };

  queryRevisions = async (documentId: string): Promise<DocumentRevisionItem[]> => {
    return this.db
      .select()
      .from(documentRevisions)
      .where(and(eq(documentRevisions.documentId, documentId), eq(documentRevisions.userId, this.userId)))
      .orderBy(desc(documentRevisions.createdAt));
  };

  findRevisionById = async (id: string): Promise<DocumentRevisionItem | undefined> => {
    return this.db.query.documentRevisions.findFirst({
      where: and(eq(documentRevisions.id, id), eq(documentRevisions.userId, this.userId)),
    });
  };

  deleteRevision = async (id: string) => {
    return this.db
      .delete(documentRevisions)
      .where(and(eq(documentRevisions.id, id), eq(documentRevisions.userId, this.userId)));
  };

  /**
   * Keep only the last keepCount revisions for a document; delete older ones.
   */
  pruneRevisions = async (documentId: string, keepCount: number = 10): Promise<number> => {
    const all = await this.queryRevisions(documentId);
    if (all.length <= keepCount) return 0;
    const toKeep = all.slice(0, keepCount);
    const toDeleteIds = all.slice(keepCount).map((r) => r.id);
    if (toDeleteIds.length === 0) return 0;
    const result = await this.db
      .delete(documentRevisions)
      .where(
        and(
          eq(documentRevisions.documentId, documentId),
          eq(documentRevisions.userId, this.userId),
          inArray(documentRevisions.id, toDeleteIds),
        ),
      );
    return result.rowCount ?? 0;
  };
}
