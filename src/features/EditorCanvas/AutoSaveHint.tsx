'use client';

import { App } from 'antd';
import { type CSSProperties } from 'react';
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import AutoSaveHintBase from '@/components/Editor/AutoSaveHint';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

export interface AutoSaveHintProps {
  /**
   * Document ID to get save status from DocumentStore
   */
  documentId: string;
  /**
   * Custom styles
   */
  style?: CSSProperties;
}

/**
 * AutoSave hint component that reads from DocumentStore.
 * Ошибки сохранения не показываются на странице — только toast и консоль.
 */
const AutoSaveHint = memo<AutoSaveHintProps>(({ documentId, style }) => {
  const { t } = useTranslation('editor');
  const { message } = App.useApp();
  const saveStatus = useDocumentStore((s) => editorSelectors.saveStatus(documentId)(s));
  const lastUpdatedTime = useDocumentStore(
    (s) => editorSelectors.lastUpdatedTime(documentId)(s) ?? null,
  );
  const performSave = useDocumentStore((s) => s.performSave);
  const errorToastShownRef = useRef(false);

  useEffect(() => {
    if (saveStatus === 'error' && !errorToastShownRef.current) {
      errorToastShownRef.current = true;
      message.error(t('autoSave.error'));
    }
    if (saveStatus !== 'error') errorToastShownRef.current = false;
  }, [saveStatus, message, t]);

  return (
    <AutoSaveHintBase
      lastUpdatedTime={lastUpdatedTime}
      onRetry={() => performSave(documentId)}
      saveStatus={saveStatus}
      style={style}
    />
  );
});

AutoSaveHint.displayName = 'AutoSaveHint';

export default AutoSaveHint;
