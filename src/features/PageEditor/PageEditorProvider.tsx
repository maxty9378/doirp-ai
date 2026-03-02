'use client';

import { useEditor } from '@lobehub/editor/react';
import { type ReactNode } from 'react';
import { memo, useCallback } from 'react';

import { InsertOnPageProvider } from './InsertOnPageContext';
import { createStore, Provider } from './store';
import { type StoreUpdaterProps } from './StoreUpdater';
import StoreUpdater from './StoreUpdater';

interface PageEditorProviderProps extends StoreUpdaterProps {
  children: ReactNode;
}

/**
 * Provide necessary methods and state for the page editor
 */
export const PageEditorProvider = memo<PageEditorProviderProps>(
  ({
    children,
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
    const editor = useEditor();
    const getEditor = useCallback(() => editor ?? null, [editor]);

    return (
      <Provider
        createStore={() =>
          createStore({
            documentId: pageId,
            editor,
            emoji,
            knowledgeBaseId,
            onBack,
            onDelete,
            onDocumentIdChange,
            onEmojiChange,
            onSave,
            onTitleChange,
            parentId,
            title,
          })
        }
      >
        <InsertOnPageProvider getEditor={getEditor}>
        <StoreUpdater
          emoji={emoji}
          knowledgeBaseId={knowledgeBaseId}
          pageId={pageId}
          parentId={parentId}
          title={title}
          onBack={onBack}
          onDelete={onDelete}
          onDocumentIdChange={onDocumentIdChange}
          onEmojiChange={onEmojiChange}
          onSave={onSave}
          onTitleChange={onTitleChange}
        />
        {children}
        </InsertOnPageProvider>
      </Provider>
    );
  },
);
