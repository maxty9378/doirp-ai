'use client';

import { DEFAULT_PROVIDER } from '@lobechat/business-const';
import { DEFAULT_MODEL } from '@lobechat/const';
import { Flexbox } from '@lobehub/ui';
import { memo, useEffect } from 'react';

import DragUploadZone, { useUploadFiles } from '@/components/DragUploadZone';
import { type ActionKeys } from '@/features/ChatInput';
import { ChatInput, ChatList } from '@/features/Conversation';
import RightPanel from '@/features/RightPanel';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';

// Не показываем выбор модели пользователю — всегда используем Gemini по умолчанию
const actions: ActionKeys[] = ['search'];

/**
 * Help analyze and work with files
 */
const FileCopilot = memo(() => {
  const pageAgentId = useAgentStore(builtinAgentSelectors.pageAgentId);
  const [activeAgentId, setActiveAgentId, useFetchAgentConfig, updateAgentConfigById] =
    useAgentStore((s) => [
      s.activeAgentId,
      s.setActiveAgentId,
      s.useFetchAgentConfig,
      s.updateAgentConfigById,
    ]);

  useEffect(() => {
    setActiveAgentId(pageAgentId);
    useChatStore.setState({ activeAgentId: pageAgentId });
  }, [pageAgentId, setActiveAgentId]);

  // По умолчанию агент страницы использует Gemini; приводим конфиг в сторе к этому
  useEffect(() => {
    if (!pageAgentId) return;
    updateAgentConfigById(pageAgentId, { model: DEFAULT_MODEL, provider: DEFAULT_PROVIDER });
  }, [pageAgentId, updateAgentConfigById]);

  const currentAgentId = activeAgentId || pageAgentId;

  // Fetch agent config when activeAgentId changes to ensure it's loaded in the store
  useFetchAgentConfig(true, currentAgentId);

  // Get agent's model info for vision support check
  const model = useAgentStore((s) => agentByIdSelectors.getAgentModelById(currentAgentId)(s));
  const provider = useAgentStore((s) =>
    agentByIdSelectors.getAgentModelProviderById(currentAgentId)(s),
  );
  const { handleUploadFiles } = useUploadFiles({ model, provider });

  return (
    <RightPanel>
      <DragUploadZone
        style={{ flex: 1, height: '100%', minWidth: 300 }}
        onUploadFiles={handleUploadFiles}
      >
        <Flexbox flex={1} height={'100%'}>
          <Flexbox flex={1} style={{ overflow: 'hidden' }}>
            <ChatList />
          </Flexbox>
          <ChatInput leftActions={actions} />
        </Flexbox>
      </DragUploadZone>
    </RightPanel>
  );
});

FileCopilot.displayName = 'FileCopilot';

export default FileCopilot;
