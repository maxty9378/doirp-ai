'use client';

import type { IEditor } from '@lobehub/editor/es/types';
import type { EditorState as LobehubEditorState } from '@lobehub/editor/react';
import isEqual from 'fast-deep-equal';

import { draftService } from '@/services/draft';
import { documentService } from '@/services/document';
import type { StoreSetter } from '@/store/types';
import { setNamespace } from '@/utils/storeDebug';

import type { DocumentStore } from '../../store';
import type { DocumentDispatch } from './reducer';
import { documentReducer } from './reducer';

const n = setNamespace('document/editor');

/**
 * Metadata passed in at save time (not stored in editor state)
 */
export interface SaveMetadata {
  emoji?: string;
  title?: string;
}

type Setter = StoreSetter<DocumentStore>;
export const createEditorSlice = (set: Setter, get: () => DocumentStore, _api?: unknown) =>
  new EditorActionImpl(set, get, _api);

export class EditorActionImpl {
  readonly #get: () => DocumentStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => DocumentStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  getEditorContent = (): { editorData: any; markdown: string } | null => {
    const { editor } = this.#get();
    if (!editor) return null;

    try {
      const markdown = (editor.getDocument('markdown') as unknown as string) || '';
      const editorData = editor.getDocument('json');
      return { editorData, markdown };
    } catch (error) {
      console.error('[DocumentStore] Failed to get editor content:', error);
      return null;
    }
  };

  handleContentChange = (): void => {
    const { editor, activeDocumentId, documents, internal_dispatchDocument } = this.#get();

    if (!editor || !activeDocumentId) return;

    const doc = documents[activeDocumentId];
    if (!doc) return;

    try {
      const markdown = (editor.getDocument('markdown') as unknown as string) || '';
      const editorData = editor.getDocument('json');

      // Check if content actually changed
      const contentChanged = markdown !== doc.lastSavedContent;

      internal_dispatchDocument(
        {
          id: activeDocumentId,
          type: 'updateDocument',
          value: { content: markdown, editorData, isDirty: contentChanged },
        },
        'handleContentChange',
      );

      // Store local draft if changed
      if (contentChanged) {
        draftService.saveDraft(activeDocumentId, {
          content: markdown,
          editorData,
          updatedAt: Date.now(),
        });
      }

      // Only trigger auto-save if content actually changed AND autoSave is enabled
      if (contentChanged && doc.autoSave !== false) {
        this.#get().triggerDebouncedSave(activeDocumentId);
      }
    } catch (error) {
      console.error('[DocumentStore] Failed to update content:', error);
    }
  };

  internal_dispatchDocument = (payload: DocumentDispatch, action?: string): void => {
    const { documents } = this.#get();
    const nextDocuments = documentReducer(documents, payload);

    if (isEqual(documents, nextDocuments)) return;

    this.#set(
      { documents: nextDocuments },
      false,
      action ?? n(`dispatchDocument/${payload.type}`, { id: payload.id }),
    );
  };

  markDirty = (documentId: string): void => {
    const { documents, internal_dispatchDocument } = this.#get();
    if (!documents[documentId]) return;

    internal_dispatchDocument({ id: documentId, type: 'updateDocument', value: { isDirty: true } });
  };

  onEditorInit = async (editor: IEditor): Promise<void> => {
    const { activeDocumentId, documents } = this.#get();
    if (!editor || !activeDocumentId) return;

    const doc = documents[activeDocumentId];

    if (!doc) return;

    // Check if editorData is valid and non-empty
    const hasValidEditorData =
      doc.editorData &&
      typeof doc.editorData === 'object' &&
      Object.keys(doc.editorData).length > 0;

    // Set content from document state
    if (hasValidEditorData) {
      try {
        editor.setDocument('json', JSON.stringify(doc.editorData));
        return;
      } catch {
        // Fallback to markdown if JSON fails
        console.warn('[DocumentStore] Failed to load editorData, falling back to markdown');
      }
    }

    // Load markdown content if available
    // Skip setDocument for empty content - let editor use its default empty state
    if (doc.content?.trim()) {
      try {
        editor.setDocument('markdown', doc.content);
      } catch (err) {
        console.error('[DocumentStore] Failed to load markdown content:', err);
      }
    }

    this.#set({ editor });
  };

  performSave = async (documentId?: string, metadata?: SaveMetadata): Promise<void> => {
    const id = documentId || this.#get().activeDocumentId;

    if (!id) return;

    const { editor, documents, internal_dispatchDocument } = this.#get();
    const doc = documents[id];
    if (!doc || !editor) return;

    // Skip save if no changes
    if (!doc.isDirty) return;

    // Update save status
    internal_dispatchDocument({ id, type: 'updateDocument', value: { saveStatus: 'saving' } });

    try {
      const currentContent = (editor.getDocument('markdown') as unknown as string) || '';
      const currentEditorData = editor.getDocument('json');

      // Save document
      await documentService.updateDocument({
        content: currentContent,
        editorData: JSON.stringify(currentEditorData),
        id,
        lastUpdatedAt: doc.lastUpdatedTime ?? undefined,
        metadata: metadata?.emoji ? { emoji: metadata.emoji } : undefined,
        title: metadata?.title,
      });

      // Mark as clean and update save status
      internal_dispatchDocument({
        id,
        type: 'updateDocument',
        value: {
          editorData: structuredClone(currentEditorData),
          isDirty: false,
          lastSavedContent: currentContent,
          lastUpdatedTime: new Date(),
          saveStatus: 'saved',
        },
      });

      // Clear local draft on success
      draftService.removeDraft(id);
    } catch (error) {
      console.error('[DocumentStore] Failed to save:', error);
      // If conflict error, maybe show a different status or message
      // For now, general error status is enough to trigger the retry UI
      internal_dispatchDocument({ id, type: 'updateDocument', value: { saveStatus: 'error' } });
    }
  };

  setEditorState = (editorState: LobehubEditorState | undefined): void => {
    this.#set({ editorState }, false, n('setEditorState'));
  };

  restoreDraft = (documentId: string): void => {
    const { documents, editor, internal_dispatchDocument } = this.#get();
    const doc = documents[documentId];
    if (!doc || !doc.draft || !editor) return;

    const { content, editorData } = doc.draft;

    // Update editor content
    try {
      editor.setDocument('json', JSON.stringify(editorData));
    } catch {
      editor.setDocument('markdown', content);
    }

    // Update state
    internal_dispatchDocument({
      id: documentId,
      type: 'updateDocument',
      value: {
        content,
        draft: undefined,
        editorData,
        isDirty: true,
      },
    });

    // Clear local draft
    draftService.removeDraft(documentId);
  };

  clearDraft = (documentId: string): void => {
    const { internal_dispatchDocument } = this.#get();
    internal_dispatchDocument({
      id: documentId,
      type: 'updateDocument',
      value: { draft: undefined },
    });
    draftService.removeDraft(documentId);
  };

  toggleHistoryPanel = (): void => {
    const { showHistoryPanel } = this.#get();
    this.#set({ showHistoryPanel: !showHistoryPanel }, false, n('toggleHistoryPanel'));
  };

  /**
   * Apply restored document content from server (e.g. after restoreRevision)
   */
  applyRestoredDocument = (
    documentId: string,
    content: string,
    editorData: Record<string, any> | null,
    lastUpdatedTime: Date,
  ): void => {
    const { editor, activeDocumentId, internal_dispatchDocument } = this.#get();
    internal_dispatchDocument({
      id: documentId,
      type: 'updateDocument',
      value: {
        content,
        editorData: editorData ?? null,
        isDirty: false,
        lastSavedContent: content,
        lastUpdatedTime,
        saveStatus: 'saved',
      },
    });
    if (editor && activeDocumentId === documentId) {
      try {
        if (editorData && typeof editorData === 'object' && Object.keys(editorData).length > 0) {
          editor.setDocument('json', JSON.stringify(editorData));
        } else if (content) {
          editor.setDocument('markdown', content);
        }
      } catch (err) {
        console.warn('[DocumentStore] applyRestoredDocument: set editor fallback to markdown', err);
        editor.setDocument('markdown', content);
      }
    }
  };
}

export type EditorAction = Pick<EditorActionImpl, keyof EditorActionImpl>;
