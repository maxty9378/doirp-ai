import { type DocumentItem } from '@lobechat/database/schemas';

import { lambdaClient } from '@/libs/trpc/client';

import { abortableRequest } from '../utils/abortableRequest';

export interface CreateDocumentParams {
  content?: string;
  editorData: string;
  fileType?: string;
  knowledgeBaseId?: string;
  metadata?: Record<string, any>;
  parentId?: string;
  slug?: string;
  title: string;
}

export interface UpdateDocumentParams {
  content?: string;
  editorData?: string;
  fileType?: string;
  id: string;
  lastUpdatedAt?: string | Date;
  metadata?: Record<string, any>;
  parentId?: string | null;
  title?: string;
}

export class DocumentService {
  async createDocument(params: CreateDocumentParams): Promise<DocumentItem> {
    return lambdaClient.document.createDocument.mutate(params);
  }

  async createDocuments(documents: CreateDocumentParams[]): Promise<DocumentItem[]> {
    return lambdaClient.document.createDocuments.mutate({ documents });
  }

  async queryDocuments(params?: {
    current?: number;
    fileTypes?: string[];
    pageSize?: number;
    sourceTypes?: string[];
  }): Promise<{ items: DocumentItem[]; total: number }> {
    return lambdaClient.document.queryDocuments.query(params);
  }

  async getDocumentById(id: string, uniqueKey?: string): Promise<DocumentItem | undefined> {
    if (uniqueKey) {
      // Use fixed key so switching documents cancels the previous request
      // This prevents race conditions where old document's data overwrites new document's editor
      return abortableRequest.execute(uniqueKey, async (signal) =>
        lambdaClient.document.getDocumentById.query({ id }, { signal }),
      );
    }

    return lambdaClient.document.getDocumentById.query({ id });
  }

  async deleteDocument(id: string): Promise<void> {
    await lambdaClient.document.deleteDocument.mutate({ id });
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    await lambdaClient.document.deleteDocuments.mutate({ ids });
  }

  async queryDeletedDocuments(params?: {
    current?: number;
    fileTypes?: string[];
    pageSize?: number;
    sourceTypes?: string[];
  }): Promise<{ items: DocumentItem[]; total: number }> {
    return lambdaClient.document.queryDeletedDocuments.query(params);
  }

  async restoreDocument(id: string): Promise<void> {
    await lambdaClient.document.restoreDocument.mutate({ id });
  }

  async updateDocument(params: UpdateDocumentParams): Promise<void> {
    const { lastUpdatedAt, ...rest } = params;
    await lambdaClient.document.updateDocument.mutate({
      ...rest,
      lastUpdatedAt: lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : undefined,
    });
  }

  async getDocumentRevisions(documentId: string) {
    return lambdaClient.document.getDocumentRevisions.query({ id: documentId });
  }

  async restoreRevision(documentId: string, revisionId: string): Promise<DocumentItem> {
    return lambdaClient.document.restoreRevision.mutate({ documentId, revisionId });
  }
}

export const documentService = new DocumentService();
