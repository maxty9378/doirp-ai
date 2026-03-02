import { type ActionIconGroupItemType } from '@lobehub/ui';
import { copyToClipboard } from '@lobehub/ui';
import { App } from 'antd';
import {
  Copy,
  Edit,
  FileInput,
  LanguagesIcon,
  ListChevronsDownUp,
  ListChevronsUpDown,
  ListRestart,
  RotateCcw,
  Share2,
  StepForward,
  Trash,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { localeOptions } from '@/locales/resources';
import { type AssistantContentBlock, type UIChatMessage } from '@/types/index';

import { useInsertOnPageContext } from '@/features/PageEditor/InsertOnPageContext';

import { dataSelectors, messageStateSelectors, useConversationStore } from '../../../store';

export interface ActionItem extends ActionIconGroupItemType {
  children?: Array<{ handleClick?: () => void; key: string; label: string }>;
  handleClick?: () => void | Promise<void>;
}

export interface GroupActions {
  collapse: ActionItem;
  continueGeneration: ActionItem;
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
}

interface UseGroupActionsParams {
  contentBlock?: AssistantContentBlock;
  data: UIChatMessage;
  id: string;
  onOpenShareModal?: () => void;
}

export const useGroupActions = ({
  id,
  data,
  contentBlock,
  onOpenShareModal,
}: UseGroupActionsParams): GroupActions => {
  const { t } = useTranslation(['common', 'chat']);
  const { message } = App.useApp();

  // Get state from ConversationStore
  const context = useConversationStore((s) => s.context);
  const isCollapsed = useConversationStore(messageStateSelectors.isMessageCollapsed(id));
  const isRegenerating = useConversationStore(messageStateSelectors.isMessageRegenerating(id));
  const lastBlockId = useConversationStore(dataSelectors.findLastMessageId(id));
  const isContinuing = useConversationStore((s) =>
    lastBlockId ? messageStateSelectors.isMessageContinuing(lastBlockId)(s) : false,
  );
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
    delAndRegenerateMessage,
    continueGenerationMessage,
  ] = useConversationStore((s) => [
    s.toggleMessageEditing,
    s.toggleMessageCollapsed,
    s.deleteMessage,
    s.regenerateAssistantMessage,
    s.translateMessage,
    s.delAndRegenerateMessage,
    s.continueGenerationMessage,
  ]);

  return useMemo<GroupActions>(
    () => ({
      collapse: {
        handleClick: () => toggleMessageCollapsed(id),
        icon: ListChevronsDownUp,
        key: 'collapse',
        label: t('messageAction.collapse', { ns: 'chat' }),
      },
      continueGeneration: {
        disabled: isContinuing,
        handleClick: () => {
          if (!lastBlockId) return;
          continueGenerationMessage(id, lastBlockId);
        },
        icon: StepForward,
        key: 'continueGeneration',
        label: t('messageAction.continueGeneration', { ns: 'chat' }),
        spin: isContinuing || undefined,
      },
      copy: {
        handleClick: async () => {
          if (!contentBlock) return;
          await copyToClipboard(contentBlock.content);
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
          if (!contentBlock) return;

          toggleMessageEditing(contentBlock.id, true);
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
            const content = (contentBlock?.content || '').trim();
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
          handleClick: () => translateMessage(id, i.value),
          key: i.value,
          label: t(`lang.${i.value}`),
        })),
        icon: LanguagesIcon,
        key: 'translate',
        label: t('translate.action', { ns: 'chat' }),
      },
    }),
    [
      id,
      contentBlock,
      data.error,
      canInsertOnPage,
      insertOnPageContext,
      isPageScope,
      isRegenerating,
      isContinuing,
      isCollapsed,
      lastBlockId,
      toggleMessageEditing,
      deleteMessage,
      regenerateAssistantMessage,
      translateMessage,
      delAndRegenerateMessage,
      toggleMessageCollapsed,
      continueGenerationMessage,
      onOpenShareModal,
      message,
    ],
  );
};
