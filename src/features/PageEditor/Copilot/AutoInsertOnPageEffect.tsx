'use client';

import { memo, useEffect, useRef } from 'react';

import { useInsertOnPageContext } from '@/features/PageEditor/InsertOnPageContext';

import {
  dataSelectors,
  messageStateSelectors,
  useConversationStore,
} from '@/features/Conversation/store';

/**
 * В чате страницы (scope === 'page'): при завершении генерации ответа ассистента
 * автоматически вставляет текст и картинки этого сообщения в документ страницы.
 */
const AutoInsertOnPageEffect = memo(() => {
  const insertOnPageContext = useInsertOnPageContext();
  const insertMessageIntoDocument = insertOnPageContext?.insertMessageIntoDocument;

  const displayMessages = useConversationStore(dataSelectors.displayMessages);
  const context = useConversationStore((s) => s.context);

  const lastAssistantMessage = displayMessages
    .slice()
    .reverse()
    .find((m) => m.role === 'assistant');
  const lastAssistantId = lastAssistantMessage?.id;

  const isGenerating = useConversationStore(
    lastAssistantId ? messageStateSelectors.isMessageGenerating(lastAssistantId) : () => false,
  );

  const prevGeneratingRef = useRef(false);
  const lastInsertedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current;
    prevGeneratingRef.current = isGenerating;

    if (
      context?.scope !== 'page' ||
      !insertMessageIntoDocument ||
      !lastAssistantId ||
      !lastAssistantMessage
    ) {
      return;
    }

    // Только что закончили генерацию этого сообщения
    if (wasGenerating && !isGenerating && lastInsertedIdRef.current !== lastAssistantId) {
      const hasContent =
        (lastAssistantMessage.content && lastAssistantMessage.content.trim() !== '') ||
        (lastAssistantMessage.imageList && lastAssistantMessage.imageList.length > 0) ||
        (lastAssistantMessage.fileList &&
          lastAssistantMessage.fileList.some(
            (f) =>
              f.fileType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(f.name || ''),
          ));
      if (hasContent) {
        lastInsertedIdRef.current = lastAssistantId;
        insertMessageIntoDocument(lastAssistantMessage);
      }
    }
  }, [
    context?.scope,
    insertMessageIntoDocument,
    isGenerating,
    lastAssistantId,
    lastAssistantMessage,
  ]);

  return null;
});

AutoInsertOnPageEffect.displayName = 'AutoInsertOnPageEffect';

export default AutoInsertOnPageEffect;
