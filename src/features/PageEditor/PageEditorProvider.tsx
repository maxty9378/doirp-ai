'use client';

import type { UIChatMessage } from '@lobechat/types';
import { useEditor } from '@lobehub/editor/react';
import { FileInput } from 'lucide-react';
import { type ReactNode } from 'react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { MessageActionItem } from '@/features/Conversation';
import { App } from 'antd';

import { InsertOnPageProvider } from './InsertOnPageContext';
import { createStore, Provider } from './store';
import { type StoreUpdaterProps } from './StoreUpdater';
import StoreUpdater from './StoreUpdater';

/** Собирает markdown из сообщения: текст + imageList + файлы-картинки из fileList. */
function buildMarkdownFromMessage(message: UIChatMessage): string {
  const parts: string[] = [];
  const content = (message.content || '').trim();
  if (content) parts.push(content);

  const imageList = message.imageList || [];
  for (const img of imageList) {
    parts.push(`![${img.alt || 'image'}](${img.url})`);
  }

  const fileList = message.fileList || [];
  for (const file of fileList) {
    const isImage =
      file.fileType?.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(file.name || '');
    if (isImage && file.url) {
      parts.push(`![${file.name || 'image'}](${file.url})`);
    }
  }

  return parts.join('\n\n');
}

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
    const { t } = useTranslation(['file', 'chat']);
    const { message: toast } = App.useApp();

    const getEditor = useCallback(() => editor ?? null, [editor]);

    const insertMessageIntoDocument = useCallback(
      (msg: UIChatMessage) => {
        const ed = editor ?? null;
        if (!ed) return;
        const md = buildMarkdownFromMessage(msg);
        if (!md.trim()) return;
        const raw = ed.getDocument('markdown');
        const current = (typeof raw === 'string' ? raw : '') || '';
        const sep = current.trim() ? '\n\n' : '';
        ed.setDocument('markdown', current + sep + md);
        toast.success(t('pageEditor.insertSuccess', { ns: 'file' }));
      },
      [editor, toast, t],
    );

    const getInsertOnPageAction = useCallback(
      (id: string, data: UIChatMessage): MessageActionItem | null => {
        return {
          key: 'insertOnPage',
          icon: FileInput,
          label: t('messageAction.insertOnPage', { ns: 'chat' }),
          handleClick: () => {
            try {
              insertMessageIntoDocument(data);
            } catch (err) {
              console.error('Insert on page failed:', err);
              toast.error(t('pageEditor.insertError', { ns: 'file' }));
            }
          },
        };
      },
      [insertMessageIntoDocument, t, toast],
    );

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
        <InsertOnPageProvider
          getEditor={getEditor}
          getInsertOnPageAction={getInsertOnPageAction}
          insertMessageIntoDocument={insertMessageIntoDocument}
        >
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
