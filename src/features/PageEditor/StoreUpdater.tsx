'use client';

import { memo, useEffect, useRef } from 'react';
import { createStoreUpdater } from 'zustand-utils';

import { getDocumentStoreState } from '@/store/document';
import { pageAgentRuntime } from '@/store/tool/slices/builtin/executors/lobe-page-agent';

import { type PublicState } from './store';
import { usePageEditorStore, useStoreApi } from './store';

export interface StoreUpdaterProps extends Partial<PublicState> {
  pageId?: string;
}

/**
 * StoreUpdater syncs PageEditorStore props and connects to page agent runtime.
 *
 * Note: Document content loading is handled by EditorCanvas via DocumentStore.
 * Title/emoji are consumed from PageEditorStore (set via setCurrentTitle/setCurrentEmoji).
 */
const StoreUpdater = memo<StoreUpdaterProps>(
  ({
    pageId,
    knowledgeBaseId,
    onDocumentIdChange,
    onEmojiChange,
    onSave,
    onTitleChange,
    onDelete,
    onBack,
    parentId,
    title,
    emoji,
  }) => {
    const storeApi = useStoreApi();
    const useStoreUpdater = createStoreUpdater(storeApi);

    const editor = usePageEditorStore((s) => s.editor);
    const initMeta = usePageEditorStore((s) => s.initMeta);
    const prevPageIdRef = useRef<string | undefined>(pageId);

    // Flush pending save when switching to another document or when unmounting (so changes aren't lost)
    useEffect(() => {
      const prev = prevPageIdRef.current;
      if (prev != null && prev !== pageId) {
        getDocumentStoreState().flushSave(prev);
      }
      prevPageIdRef.current = pageId;
      return () => {
        if (pageId) getDocumentStoreState().flushSave(pageId);
      };
    }, [pageId]);

    // Update store with props
    useStoreUpdater('documentId', pageId);
    useStoreUpdater('knowledgeBaseId', knowledgeBaseId);
    useStoreUpdater('onDocumentIdChange', onDocumentIdChange);
    useStoreUpdater('onEmojiChange', onEmojiChange);
    useStoreUpdater('onSave', onSave);
    useStoreUpdater('onTitleChange', onTitleChange);
    useStoreUpdater('onDelete', onDelete);
    useStoreUpdater('onBack', onBack);
    useStoreUpdater('parentId', parentId);

    // Initialize meta (title/emoji) with dirty tracking
    useEffect(() => {
      initMeta(title, emoji);
    }, [pageId, title, emoji]);

    // Connect editor to page agent runtime
    useEffect(() => {
      if (editor) {
        pageAgentRuntime.setEditor(editor);
      }
      return () => {
        pageAgentRuntime.setEditor(null);
      };
    }, [editor]);

    // Connect title handlers and document ID to page agent runtime
    useEffect(() => {
      const titleGetter = () => {
        return storeApi.getState().title || '';
      };

      pageAgentRuntime.setCurrentDocId(pageId);
      pageAgentRuntime.setTitleHandlers(storeApi.getState().setTitle, titleGetter);

      return () => {
        pageAgentRuntime.setCurrentDocId(undefined);
        pageAgentRuntime.setTitleHandlers(null, null);
      };
    }, [pageId, storeApi]);

    return null;
  },
);

export default StoreUpdater;
