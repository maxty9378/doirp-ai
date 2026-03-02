import { Button, Flexbox, Highlighter } from '@lobehub/ui';
import { App } from 'antd';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { LOADING_FLAT } from '@/const/message';
import { useErrorContent } from '@/features/Conversation/Error';
import { useInsertOnPageContext } from '@/features/PageEditor/InsertOnPageContext';
import { type AssistantContentBlock } from '@/types/index';

import ErrorContent from '../../../ChatItem/components/ErrorContent';
import { messageStateSelectors, useConversationStore } from '../../../store';
import ImageFileListViewer from '../../components/ImageFileListViewer';
import Reasoning from '../../components/Reasoning';
import { Tools } from '../Tools';
import MessageContent from './MessageContent';

interface ContentBlockProps extends AssistantContentBlock {
  assistantId: string;
  disableEditing?: boolean;
}
const INSERT_ON_PAGE_BUTTON_STYLE = { marginTop: 6 } as const;

const ContentBlock = memo<ContentBlockProps>(
  ({ id, tools, content, imageList, reasoning, error, assistantId, disableEditing }) => {
    const { t } = useTranslation('chat');
    const { message: messageApi } = App.useApp();
    const errorContent = useErrorContent(error);
    const context = useConversationStore((s) => s.context);
    const insertOnPageContext = useInsertOnPageContext();
    const generating = useConversationStore(messageStateSelectors.isMessageGenerating(id));
    const showImageItems = !!imageList && imageList.length > 0;
    const [isReasoning, deleteMessage, continueGeneration] = useConversationStore((s) => [
      messageStateSelectors.isMessageInReasoning(id)(s),
      s.deleteDBMessage,
      s.continueGeneration,
    ]);
    const hasTools = tools && tools.length > 0;
    const showReasoning =
      (!!reasoning && reasoning.content?.trim() !== '') || (!reasoning && isReasoning);

    const handleRegenerate = useCallback(async () => {
      await deleteMessage(id);
      continueGeneration(assistantId);
    }, [id]);

    const handleInsertOnPage = useCallback(() => {
      if (!insertOnPageContext) return;
      const editor = insertOnPageContext.getEditor();
      if (!editor) {
        messageApi.warning(t('pageEditor.editorNotReady', { ns: 'file' }));
        return;
      }
      const text = (content || '').trim();
      if (!text) return;
      try {
        const current = (editor.getDocument('markdown') as unknown as string) || '';
        const newContent = current.trim() ? `${current}\n\n${text}` : text;
        editor.setDocument('markdown', newContent);
        messageApi.success(t('pageEditor.insertSuccess', { ns: 'file' }));
        editor.focus?.();
      } catch (err) {
        console.error('[insertOnPage]', err);
        messageApi.error(t('pageEditor.insertError', { ns: 'file' }));
      }
    }, [content, insertOnPageContext, messageApi, t]);

    const showInsertOnPage =
      context?.scope === 'page' &&
      !!insertOnPageContext &&
      !generating &&
      !!(content || '').trim();

    if (error && (content === LOADING_FLAT || !content)) {
      return (
        <ErrorContent
          id={id}
          error={
            errorContent && error && (content === LOADING_FLAT || !content)
              ? {
                  ...errorContent,
                  extra: error?.body && (
                    <Highlighter
                      actionIconSize={'small'}
                      language={'json'}
                      padding={8}
                      variant={'borderless'}
                    >
                      {JSON.stringify(error?.body, null, 2)}
                    </Highlighter>
                  ),
                }
              : undefined
          }
          onRegenerate={handleRegenerate}
        />
      );
    }

    return (
      <Flexbox gap={8} id={id}>
        {showReasoning && <Reasoning {...reasoning} id={id} />}

        {/* Content - markdown text */}
        <MessageContent content={content} hasTools={hasTools} id={id} />

        {showInsertOnPage && (
          <Flexbox justify={'flex-end'} style={INSERT_ON_PAGE_BUTTON_STYLE}>
            <Button size={'small'} type={'primary'} onClick={handleInsertOnPage}>
              {t('messageAction.insertOnPage', { defaultValue: 'Вставить на страницу' })}
            </Button>
          </Flexbox>
        )}

        {/* Image files */}
        {showImageItems && <ImageFileListViewer items={imageList} />}

        {/* Tools */}
        {hasTools && <Tools disableEditing={disableEditing} messageId={id} tools={tools} />}
      </Flexbox>
    );
  },
);

export default ContentBlock;
