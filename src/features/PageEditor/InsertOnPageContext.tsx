'use client';

import type { IEditor } from '@lobehub/editor';
import type { UIChatMessage } from '@lobechat/types';
import { createContext, memo, useContext, useMemo, type ReactNode } from 'react';

import type { MessageActionItem } from '@/features/Conversation';

export interface InsertOnPageContextValue {
  getEditor: () => IEditor | null;
  /** Создаёт действие «Вставить на страницу» для сообщения (для кнопки в тулбаре). */
  getInsertOnPageAction?: (id: string, data: UIChatMessage) => MessageActionItem | null;
  /** Вставляет содержимое сообщения (текст + картинки) в документ страницы. */
  insertMessageIntoDocument?: (message: UIChatMessage) => void;
}

export const InsertOnPageContext = createContext<InsertOnPageContextValue | null>(null);

export const useInsertOnPageContext = (): InsertOnPageContextValue | null =>
  useContext(InsertOnPageContext);

interface InsertOnPageProviderProps {
  children: ReactNode;
  getEditor: () => IEditor | null;
  getInsertOnPageAction?: (id: string, data: UIChatMessage) => MessageActionItem | null;
  insertMessageIntoDocument?: (message: UIChatMessage) => void;
}

export const InsertOnPageProvider = memo<InsertOnPageProviderProps>(
  ({ children, getEditor, getInsertOnPageAction, insertMessageIntoDocument }) => {
    const value = useMemo<InsertOnPageContextValue>(
      () => ({ getEditor, getInsertOnPageAction, insertMessageIntoDocument }),
      [getEditor, getInsertOnPageAction, insertMessageIntoDocument],
    );
    return (
      <InsertOnPageContext.Provider value={value}>{children}</InsertOnPageContext.Provider>
    );
  },
);
