'use client';

import type { IEditor } from '@lobehub/editor';
import { createContext, memo, useContext, useMemo, type ReactNode } from 'react';

export interface InsertOnPageContextValue {
  getEditor: () => IEditor | null;
}

export const InsertOnPageContext = createContext<InsertOnPageContextValue | null>(null);

export const useInsertOnPageContext = (): InsertOnPageContextValue | null =>
  useContext(InsertOnPageContext);

interface InsertOnPageProviderProps {
  children: ReactNode;
  getEditor: () => IEditor | null;
}

export const InsertOnPageProvider = memo<InsertOnPageProviderProps>(({ children, getEditor }) => {
  const value = useMemo<InsertOnPageContextValue>(() => ({ getEditor }), [getEditor]);
  return (
    <InsertOnPageContext.Provider value={value}>{children}</InsertOnPageContext.Provider>
  );
});
