import { type ActionIconGroupItemType } from '@lobehub/ui';
import { copyToClipboard } from '@lobehub/ui';
import { App } from 'antd';
import { css, cx } from 'antd-style';
import {
  Copy,
  Edit,
  FileInput,
  LanguagesIcon,
  ListChevronsDownUp,
  ListChevronsUpDown,
  ListRestart,
  Play,
  RotateCcw,
  Share2,
  Trash,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useInsertOnPageContext } from '@/features/PageEditor/InsertOnPageContext';
import { localeOptions } from '@/locales/resources';
import { type UIChatMessage } from '@/types/index';

import { messageStateSelectors, useConversationStore } from '../../../store';

const translateStyle = css`
  .ant-dropdown-menu-sub {
    overflow-y: scroll;
    max-height: 400px;
  }
`;

export interface ActionItem extends ActionIconGroupItemType {
  children?: Array<{ handleClick?: () => void; key: string; label: string }>;
  handleClick?: () => void | Promise<void>;
}

export interface AssistantActions {
  collapse: ActionItem;
  copy: ActionItem;
  del: ActionItem;
  delAndRegenerate: ActionItem;
  divider: { type: 'divider' };
  edit: ActionItem;
  expand: ActionItem;
  insertOnPage?: ActionItem;
  regenerate: ActionItem;
  share: ActionItem;
  translate: ActionItem;
  tts: ActionItem;
}

interface UseAssistantActionsParams {
  data: UIChatMessage;
  id: string;
  index: number;
  onOpenShareModal?: () => void;
}

export const useAssistantActions = ({
  id,
  data,
  onOpenShareModal,
}: UseAssistantActionsParams): AssistantActions => {
  const { t } = useTranslation(['common', 'chat']);
  const { message } = App.useApp();

  // Get state from ConversationStore
  const context = useConversationStore((s) => s.context);
  const isCollapsed = useConversationStore(messageStateSelectors.isMessageCollapsed(id));
  const isRegenerating = useConversationStore(messageStateSelectors.isMessageRegenerating(id));
  const isPageScope = context?.scope === 'page';
  const insertOnPageContext = useInsertOnPageContext();
  const canInsertOnPage = isPageScope && !!insertOnPageContext;

  // Get actions from ConversationStore
  const [
    toggleMessageEditing,
    toggleMessageCollapsed,
    deleteMessage,
    regenerateAssistantMessage,
    translateMessage,
    ttsMessage,
    delAndRegenerateMessage,
  ] = useConversationStore((s) => [
    s.toggleMessageEditing,
    s.toggleMessageCollapsed,
    s.deleteMessage,
    s.regenerateAssistantMessage,
    s.translateMessage,
    s.ttsMessage,
    s.delAndRegenerateMessage,
  ]);

  return useMemo<AssistantActions>(
    () => ({
      collapse: {
        handleClick: () => toggleMessageCollapsed(id),
        icon: ListChevronsDownUp,
        key: 'collapse',
        label: t('messageAction.collapse', { ns: 'chat' }),
      },
      copy: {
        handleClick: async () => {
          await copyToClipboard(data.content);
          message.success(t('copySuccess'));
        },
        icon: Copy,
        key: 'copy',
        label: t('copy'),
      },
      del: {
        danger: true,
        handleClick: () => deleteMessage(id),
        icon: Trash,
        key: 'del',
        label: t('delete'),
      },
      delAndRegenerate: {
        disabled: isRegenerating,
        handleClick: () => delAndRegenerateMessage(id),
        icon: ListRestart,
        key: 'delAndRegenerate',
        label: t('messageAction.delAndRegenerate', { ns: 'chat' }),
      },
      divider: {
        type: 'divider',
      },
      edit: {
        handleClick: () => {
          toggleMessageEditing(id, true);
        },
        icon: Edit,
        key: 'edit',
        label: t('edit'),
      },
      expand: {
        handleClick: () => toggleMessageCollapsed(id),
        icon: ListChevronsUpDown,
        key: 'expand',
        label: t('messageAction.expand', { ns: 'chat' }),
      },
      ...(canInsertOnPage && {
        insertOnPage: {
          handleClick: () => {
            const editor = insertOnPageContext!.getEditor();
            if (!editor) {
              message.warning(t('pageEditor.editorNotReady', { ns: 'file' }));
              return;
            }
            const content = (data.content || '').trim();
            if (!content) return;
            try {
              const current = (editor.getDocument('markdown') as unknown as string) || '';
              const newContent = current.trim() ? `${current}\n\n${content}` : content;
              editor.setDocument('markdown', newContent);
              message.success(t('pageEditor.insertSuccess', { ns: 'file' }));
              editor.focus?.();
            } catch (err) {
              console.error('[insertOnPage]', err);
              message.error(t('pageEditor.insertError', { ns: 'file' }));
            }
          },
          icon: FileInput,
          key: 'insertOnPage',
          label: t('messageAction.insertOnPage', { ns: 'chat' }),
        },
      }),
      regenerate: {
        disabled: isRegenerating,
        handleClick: () => {
          regenerateAssistantMessage(id);
          if (data.error) deleteMessage(id);
        },
        icon: RotateCcw,
        key: 'regenerate',
        label: t('regenerate'),
        spin: isRegenerating || undefined,
      },
      share: {
        handleClick: onOpenShareModal,
        icon: Share2,
        key: 'share',
        label: t('share'),
      },
      translate: {
        children: localeOptions.map((i) => ({
          key: i.value,
          label: t(`lang.${i.value}`),
          onClick: () => translateMessage(id, i.value),
        })),
        icon: LanguagesIcon,
        key: 'translate',
        label: t('translate.action', { ns: 'chat' }),
        popupClassName: cx(translateStyle),
      },
      tts: {
        handleClick: () => ttsMessage(id),
        icon: Play,
        key: 'tts',
        label: t('tts.action', { ns: 'chat' }),
      },
    }),
    [
      t,
      id,
      data.content,
      data.error,
      canInsertOnPage,
      insertOnPageContext,
      isPageScope,
      isRegenerating,
      isCollapsed,
      toggleMessageEditing,
      deleteMessage,
      regenerateAssistantMessage,
      translateMessage,
      ttsMessage,
      delAndRegenerateMessage,
      toggleMessageCollapsed,
      onOpenShareModal,
      message,
    ],
  );
};
