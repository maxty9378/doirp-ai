import { type LobeChatDatabase } from '@lobechat/database';
import { type DocumentItem } from '@lobechat/database/schemas';
import { loadFile } from '@lobechat/file-loaders';
import debug from 'debug';

import { DocumentModel } from '@/database/models/document';
import { FileModel } from '@/database/models/file';
import { type LobeDocument } from '@/types/document';

import { FileService } from '../file';

const log = debug('lobe-chat:service:document');

export class DocumentService {
  userId: string;
  private fileModel: FileModel;
  private documentModel: DocumentModel;
  private fileService: FileService;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
    this.fileModel = new FileModel(db, userId);
    this.fileService = new FileService(db, userId);
    this.documentModel = new DocumentModel(db, userId);
  }

  /**
   * Create a document
   */
  async createDocument(params: {
    content?: string;
    editorData: Record<string, any>;
    fileType?: string;
    knowledgeBaseId?: string;
    metadata?: Record<string, any>;
    parentId?: string;
    rawData?: string;
    slug?: string;
    title: string;
  }): Promise<DocumentItem> {
    const {
      content,
      editorData,
      title,
      fileType = 'custom/document',
      metadata,
      knowledgeBaseId,
      parentId,
      slug,
    } = params;

    // Calculate character and line counts
    const totalCharCount = content?.length || 0;
    const totalLineCount = content?.split('\n').length || 0;

    let fileId: string | null = null;

    // If creating in a knowledge base, create a corresponding file record
    // BUT skip for folders - folders should only exist in the documents table
    if (knowledgeBaseId && fileType !== 'custom/folder') {
      const file = await this.fileModel.create(
        {
          fileType,
          knowledgeBaseId,
          metadata,
          name: title,
          parentId,
          size: totalCharCount,
          url: `internal://document/placeholder`, // Placeholder URL
        },
        false, // Do not insert to global files
      );
      fileId = file.id;
    }

    // Store knowledgeBaseId in metadata for folders (which don't have fileId)
    const finalMetadata =
      knowledgeBaseId && fileType === 'custom/folder' ? { ...metadata, knowledgeBaseId } : metadata;

    const document = await this.documentModel.create({
      content,
      editorData,
      fileId,
      fileType,
      filename: title,
      knowledgeBaseId, // Set knowledge_base_id column for all document types
      metadata: finalMetadata,
      pages: undefined,
      parentId,
      slug,
      source: 'document',
      sourceType: 'api',
      title,
      totalCharCount,
      totalLineCount,
    });

    return document;
  }

  /**
   * Create multiple documents in batch (optimized for folder creation)
   * Returns array of created documents with same order as input
   */
  async createDocuments(
    documents: Array<{
      content?: string;
      editorData: Record<string, any>;
      fileType?: string;
      knowledgeBaseId?: string;
      metadata?: Record<string, any>;
      parentId?: string;
      slug?: string;
      title: string;
    }>,
  ): Promise<DocumentItem[]> {
    // Create all documents in parallel for better performance
    const results = await Promise.all(documents.map((params) => this.createDocument(params)));

    return results;
  }

  /**
   * Query documents with pagination
   */
  async queryDocuments(params?: {
    current?: number;
    fileTypes?: string[];
    pageSize?: number;
    sourceTypes?: string[];
  }) {
    return this.documentModel.query(params);
  }

  /**
   * Get document by ID
   */
  async getDocumentById(id: string) {
    return this.documentModel.findById(id);
  }

  /**
   * Soft-delete (archive) document. It stays in DB and appears in archive; purged after 24h if not restored.
   */
  async deleteDocument(id: string) {
    return this.documentModel.delete(id);
  }

  /**
   * Soft-delete multiple documents in batch
   */
  async deleteDocuments(ids: string[]) {
    await Promise.all(ids.map((id) => this.deleteDocument(id)));
  }

  /**
   * List soft-deleted (archived) documents for the current user
   */
  async queryDeletedDocuments(params?: {
    current?: number;
    fileTypes?: string[];
    pageSize?: number;
    sourceTypes?: string[];
  }) {
    return this.documentModel.queryDeleted(params);
  }

  /**
   * Restore a soft-deleted document
   */
  async restoreDocument(id: string) {
    return this.documentModel.restore(id);
  }

  /**
   * Permanently remove documents that have been in archive longer than 24h
   */
  async purgeDeletedOlderThan24h(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.documentModel.purgeDeletedOlderThan(cutoff);
  }

  /**
   * Update document
   */
  async updateDocument(
    id: string,
    params: {
      content?: string;
      editorData?: Record<string, any>;
      fileType?: string;
      lastUpdatedAt?: string | Date;
      metadata?: Record<string, any>;
      parentId?: string | null;
      title?: string;
    },
  ) {
    const currentDoc = await this.documentModel.findById(id);
    if (!currentDoc) {
      throw new Error(`Document not found: ${id}`);
    }

    // 1. Conflict Detection
    if (params.lastUpdatedAt) {
      const dbUpdatedAt = new Date(currentDoc.updatedAt).getTime();
      const clientUpdatedAt = new Date(params.lastUpdatedAt).getTime();

      // If DB has a newer version (allow 1s tolerance for clock drift)
      if (dbUpdatedAt > clientUpdatedAt + 1000) {
        throw new Error('Conflict: Document has been modified by another session');
      }
    }

    // 2. Create Revision (snapshot current state before update); keep only last 10
    if (
      (params.content !== undefined && params.content !== currentDoc.content) ||
      params.editorData !== undefined
    ) {
      await this.documentModel.createRevision({
        content: currentDoc.content,
        documentId: id,
        editorData: currentDoc.editorData,
        metadata: currentDoc.metadata,
      });
      await this.documentModel.pruneRevisions(id, 10);
    }

    const updates: any = {};

    if (params.content !== undefined) {
      updates.content = params.content;
      updates.totalCharCount = params.content.length;
      updates.totalLineCount = params.content.split('\n').length;
    }

    if (params.editorData !== undefined) {
      updates.editorData = params.editorData;
    }

    if (params.fileType !== undefined) {
      updates.fileType = params.fileType;
    }

    if (params.title !== undefined) {
      updates.title = params.title;
      updates.filename = params.title;
    }

    if (params.metadata !== undefined) {
      updates.metadata = params.metadata;
    }

    if (params.parentId !== undefined) {
      updates.parentId = params.parentId;
    }

    await this.documentModel.update(id, updates);

    // If title was updated and this document has an associated file, update the file name too
    if (params.title !== undefined || params.parentId !== undefined) {
      const document = await this.documentModel.findById(id);
      if (document?.fileId) {
        const fileUpdates: any = {};
        if (params.title !== undefined) fileUpdates.name = params.title;
        if (params.parentId !== undefined) fileUpdates.parentId = params.parentId;
        await this.fileModel.update(document.fileId, fileUpdates);
      }
    }

    const doc = await this.documentModel.findById(id);
    if (!doc) throw new Error(`Document not found: ${id}`);
    return doc;
  }

  /**
   * Get document revisions
   */
  async getDocumentRevisions(documentId: string) {
    return this.documentModel.queryRevisions(documentId);
  }

  /**
   * Restore a revision
   */
  async restoreRevision(documentId: string, revisionId: string) {
    const revision = await this.documentModel.findRevisionById(revisionId);
    if (!revision) {
      throw new Error(`Revision not found: ${revisionId}`);
    }

    // Restore content from revision
    // This will trigger a new revision of the *current* state (which is good)
    return this.updateDocument(documentId, {
      content: revision.content || '',
      editorData: revision.editorData || {},
      metadata: revision.metadata || {},
    });
  }

  /**
   * Parse file and create a document for page editor (without page tags)
   */
  async parseDocument(fileId: string): Promise<LobeDocument> {
    const { filePath, file, cleanup } = await this.fileService.downloadFileToLocal(fileId);

    const logPrefix = `[${file.name}]`;
    log(`${logPrefix} Starting to parse file as document, path: ${filePath}`);

    try {
      // Use loadFile to load file content
      const fileDocument = await loadFile(filePath);

      log(`${logPrefix} File parsed successfully %O`, {
        fileType: fileDocument.fileType,
        size: fileDocument.content.length,
      });

      // Extract title from metadata or use file name (remove extension)
      const title =
        fileDocument.metadata?.title ||
        file.name.replace(/\.(pdf|docx?|md|markdown)$/i, '') ||
        'Untitled';

      // Clean up content - remove <page> tags if present
      let cleanContent = fileDocument.content;
      if (cleanContent.includes('<page')) {
        cleanContent = cleanContent.replaceAll(/<page[^>]*>([\S\s]*?)<\/page>/g, '$1').trim();
      }

      const document = await this.documentModel.create({
        content: cleanContent,
        fileId,
        fileType: 'custom/document',
        filename: title,
        metadata: fileDocument.metadata,
        parentId: file.parentId,
        source: file.url,
        sourceType: 'file',
        title,
        totalCharCount: cleanContent.length,
        totalLineCount: cleanContent.split('\n').length,
      });

      return document as LobeDocument;
    } catch (error) {
      console.error(`${logPrefix} File parsing failed:`, error);
      throw error;
    } finally {
      cleanup();
    }
  }

  /**
   * Parse file content
   *
   */
  async parseFile(fileId: string): Promise<LobeDocument> {
    const { filePath, file, cleanup } = await this.fileService.downloadFileToLocal(fileId);

    const logPrefix = `[${file.name}]`;
    log(`${logPrefix} Starting to parse file, path: ${filePath}`);

    try {
      // Use loadFile to load file content
      const fileDocument = await loadFile(filePath);

      log(`${logPrefix} File parsed successfully %O`, {
        fileType: fileDocument.fileType,
        size: fileDocument.content.length,
      });

      // Extract title from metadata or use file name (remove extension)
      const title =
        fileDocument.metadata?.title ||
        file.name.replace(/\.(pdf|docx?|md|markdown)$/i, '') ||
        'Untitled';

      const document = await this.documentModel.create({
        content: fileDocument.content,
        fileId,
        fileType: 'custom/document', // Use custom/document for all parsed files
        filename: title,
        metadata: fileDocument.metadata,
        pages: fileDocument.pages,
        parentId: file.parentId,
        source: file.url,
        sourceType: 'file',
        title,
        totalCharCount: fileDocument.totalCharCount,
        totalLineCount: fileDocument.totalLineCount,
      });

      return document as LobeDocument;
    } catch (error) {
      console.error(`${logPrefix} File parsing failed:`, error);
      throw error;
    } finally {
      cleanup();
    }
  }
}
