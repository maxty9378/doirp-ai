import { type DropdownItem } from '@lobehub/ui';
import { Icon } from '@lobehub/ui';
import { App } from 'antd';
import { cssVar, useResponsive } from 'antd-style';
import dayjs from 'dayjs';
import { CopyPlus, HistoryIcon, Link2, Maximize2, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';
import { useFileStore } from '@/store/file';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { usePageEditorStore, useStoreApi } from '../store';
import { WordDownloadIcon } from './WordDownloadIcon';

/**
 * Action menu for the page editor.
 */
export const useMenu = (): { menuItems: any[] } => {
  const { t } = useTranslation(['file', 'common', 'chat']);
  const { message, modal } = App.useApp();
  const storeApi = useStoreApi();
  const { lg = true } = useResponsive();

  const documentId = usePageEditorStore((s) => s.documentId);

  // Get lastUpdatedTime from DocumentStore
  const lastUpdatedTime = useDocumentStore((s) =>
    documentId ? editorSelectors.lastUpdatedTime(documentId)(s) : null,
  );

  const duplicateDocument = useFileStore((s) => s.duplicateDocument);

  const [wideScreen, toggleWideScreen] = useGlobalStore((s) => [
    systemStatusSelectors.wideScreen(s),
    s.toggleWideScreen,
  ]);

  // Wide screen mode only makes sense when screen is large enough
  const showViewModeSwitch = lg;

  const handleDuplicate = async () => {
    if (!documentId) return;
    try {
      await duplicateDocument(documentId);
      message.success(t('pageEditor.duplicateSuccess'));
    } catch (error) {
      console.error('Failed to duplicate page:', error);
      message.error(t('pageEditor.duplicateError'));
    }
  };

  const handleExportWord = async () => {
    const state = storeApi.getState();
    const { editor, title } = state;

    if (!editor) return;

    try {
      const raw = editor.getDocument('markdown');
      const markdown = (typeof raw === 'string' ? raw : '') || '';
      const body = markdown.trim() || ' ';
      const fileName = `${title || 'Untitled'}.docx`;
      const markdownWithTitle =
        title?.trim() ? `# ${title.trim()}\n\n${body}` : body;

      const { convertMarkdownToDocx, downloadDocx } = await import('@mohtasham/md-to-docx');
      const blob = await convertMarkdownToDocx(markdownWithTitle);

      if (typeof downloadDocx === 'function') {
        downloadDocx(blob, fileName);
        message.success(t('pageEditor.exportSuccess'));
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        message.success(t('pageEditor.exportSuccess'));
      }
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : error != null ? String(error) : 'Unknown error';
      console.error('Failed to export Word:', error);
      const isModuleMissing =
        typeof errMsg === 'string' &&
        (errMsg.includes('Cannot find module') || errMsg.includes('@mohtasham/md-to-docx'));
      message.error(
        isModuleMissing
          ? t('pageEditor.exportErrorWordModule', {
              defaultValue: 'Не удалось экспортировать страницу. Выполните в корне проекта: pnpm install',
            })
          : t('pageEditor.exportError') + (errMsg ? `: ${errMsg}` : ''),
      );
    }
  };

  const menuItems = useMemo<DropdownItem[]>(() => {
    const items: DropdownItem[] = [
      ...(showViewModeSwitch
        ? [
            {
              checked: wideScreen,
              icon: <Icon icon={Maximize2} />,
              key: 'full-width',
              label: t('viewMode.fullWidth', { ns: 'chat' }),
              onCheckedChange: toggleWideScreen,
              type: 'switch' as const,
            },
            {
              type: 'divider' as const,
            },
          ]
        : []),
      {
        icon: <Icon icon={CopyPlus} />,
        key: 'duplicate',
        label: t('pageList.duplicate'),
        onClick: handleDuplicate,
      },
      {
        icon: <Icon icon={Link2} />,
        key: 'copy-link',
        label: t('pageEditor.menu.copyLink'),
        onClick: () => {
          const state = storeApi.getState();
          state.handleCopyLink(t as any, message);
        },
      },
      {
        danger: true,
        icon: <Icon icon={Trash2} />,
        key: 'delete',
        label: t('delete', { ns: 'common' }),
        onClick: async () => {
          const state = storeApi.getState();
          await state.handleDelete(t as any, message, modal, state.onDelete);
        },
      },
      {
        icon: <Icon icon={HistoryIcon} />,
        key: 'history',
        label: t('pageEditor.menu.history'),
        onClick: () => {
          useDocumentStore.getState().toggleHistoryPanel();
        },
      },
      {
        type: 'divider' as const,
      },
      {
        icon: <WordDownloadIcon />,
        key: 'export',
        label: t('pageEditor.menu.export'),
        onClick: handleExportWord,
      },
    ];

    if (lastUpdatedTime) {
      items.push(
        {
          type: 'divider' as const,
        },
        {
          disabled: true,
          key: 'page-info',
          label: (
            <div style={{ color: cssVar.colorTextTertiary, fontSize: 12, lineHeight: 1.6 }}>
              <div>
                {lastUpdatedTime
                  ? t('pageEditor.editedAt', {
                      time: dayjs(lastUpdatedTime).format('MMMM D, YYYY [at] h:mm A'),
                    })
                  : ''}
              </div>
            </div>
          ),
        },
      );
    }
    return items;
  }, [
    lastUpdatedTime,
    storeApi,
    t,
    message,
    modal,
    wideScreen,
    toggleWideScreen,
    showViewModeSwitch,
    handleDuplicate,
    handleExportWord,
  ]);

  return { menuItems };
};
