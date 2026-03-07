'use client';

import { App, Button, Drawer, List, Spin } from 'antd';
import dayjs from 'dayjs';
import { RotateCcw } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Flexbox, Icon } from '@lobehub/ui';

import { documentService } from '@/services/document';
import { useDocumentStore } from '@/store/document';

import { usePageEditorStore } from './store';

interface RevisionItem {
  id: string;
  createdAt: Date | string;
  content?: string | null;
  editorData?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

const HistoryPanel = memo(() => {
  const { message } = App.useApp();
  const { t } = useTranslation('file');
  const documentId = usePageEditorStore((s) => s.documentId);
  const open = useDocumentStore((s) => s.showHistoryPanel);
  const toggleHistoryPanel = useDocumentStore((s) => s.toggleHistoryPanel);
  const applyRestoredDocument = useDocumentStore((s) => s.applyRestoredDocument);

  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !documentId) return;
    setLoading(true);
    documentService
      .getDocumentRevisions(documentId)
      .then((list) => setRevisions(list as RevisionItem[]))
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false));
  }, [open, documentId]);

  const handleRestore = async (rev: RevisionItem) => {
    if (!documentId) return;
    setRestoringId(rev.id);
    try {
      const doc = await documentService.restoreRevision(documentId, rev.id);
      const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt) : new Date();
      applyRestoredDocument(
        documentId,
        doc?.content ?? '',
        doc?.editorData ?? null,
        updatedAt,
      );
      message.success(t('pageEditor.history.restored', { defaultValue: 'Версия восстановлена' }));
      toggleHistoryPanel();
    } catch (e) {
      console.error('Restore revision failed:', e);
      message.error(t('pageEditor.history.restoreError', { defaultValue: 'Не удалось восстановить версию' }));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Drawer
      closable
      destroyOnClose
      onClose={toggleHistoryPanel}
      open={open}
      size={360}
      title={t('pageEditor.history.title')}
    >
      {loading ? (
        <Flexbox align="center" justify="center" style={{ padding: 24 }}>
          <Spin />
        </Flexbox>
      ) : revisions.length === 0 ? (
        <div style={{ color: 'var(--colorTextTertiary)', padding: 24, textAlign: 'center' }}>
          {t('pageEditor.history.empty')}
        </div>
      ) : (
        <List
          dataSource={revisions}
          rowKey="id"
          renderItem={(rev) => (
            <List.Item
              actions={[
                <Button
                  disabled={!!restoringId}
                  key="restore"
                  loading={restoringId === rev.id}
                  onClick={() => handleRestore(rev)}
                  size="small"
                  type="link"
                >
                  {restoringId === rev.id
                    ? t('pageEditor.history.restoring')
                    : t('pageEditor.history.restore')}
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<Icon icon={RotateCcw} style={{ fontSize: 16 }} />}
                description={dayjs(rev.createdAt).format('D MMM YYYY, HH:mm')}
                title={dayjs(rev.createdAt).format('D MMM YYYY')}
              />
            </List.Item>
          )}
          size="small"
        />
      )}
    </Drawer>
  );
});

HistoryPanel.displayName = 'HistoryPanel';

export default HistoryPanel;
