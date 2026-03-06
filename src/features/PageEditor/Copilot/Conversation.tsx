import { DEFAULT_PROVIDER } from '@lobechat/business-const';
import { DEFAULT_MODEL } from '@lobechat/const';
import { Flexbox } from '@lobehub/ui';
import { memo, useEffect } from 'react';

import DragUploadZone, { useUploadFiles } from '@/components/DragUploadZone';
import { type ActionKeys } from '@/features/ChatInput';
import { ChatInput, ChatList } from '@/features/Conversation';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';

import CopilotToolbar from './Toolbar';
import Welcome from './Welcome';

const LEFT_ACTIONS: ActionKeys[] = ['fileUpload', 'search'];

const COMPACT_ACTION_BAR_STYLE = { paddingLeft: 4, paddingRight: 4 };
const COMPACT_SEND_BUTTON_PROPS = { size: 28 };

interface ConversationProps {
  agentId: string;
}

const Conversation = memo<ConversationProps>(({ agentId }) => {
  const [activeAgentId, setActiveAgentId, updateAgentConfigById, useFetchAgentConfig] = useAgentStore((s) => [
    s.activeAgentId,
    s.setActiveAgentId,
    s.updateAgentConfigById,
    s.useFetchAgentConfig,
  ]);

  useEffect(() => {
    setActiveAgentId(agentId);
    useChatStore.setState({ activeAgentId: agentId });
  }, [agentId, setActiveAgentId]);

  const currentAgentId = activeAgentId || agentId;

  useFetchAgentConfig(true, currentAgentId);

  useEffect(() => {
    updateAgentConfigById(agentId, { model: DEFAULT_MODEL, provider: DEFAULT_PROVIDER });
  }, [agentId, updateAgentConfigById]);

  const model = useAgentStore((s) => agentByIdSelectors.getAgentModelById(currentAgentId)(s));
  const provider = useAgentStore((s) =>
    agentByIdSelectors.getAgentModelProviderById(currentAgentId)(s),
  );
  const { handleUploadFiles } = useUploadFiles({ model, provider });

  return (
    <DragUploadZone
      style={{ flex: 1, height: '100%', minWidth: 300 }}
      onUploadFiles={handleUploadFiles}
    >
      <Flexbox flex={1} height={'100%'}>
        <CopilotToolbar agentId={currentAgentId} />
        <Flexbox flex={1} style={{ overflow: 'hidden' }}>
          <ChatList welcome={<Welcome />} />
        </Flexbox>
        <ChatInput
          actionBarStyle={COMPACT_ACTION_BAR_STYLE}
          allowExpand={false}
          leftActions={LEFT_ACTIONS}
          sendButtonProps={COMPACT_SEND_BUTTON_PROPS}
        />
      </Flexbox>
    </DragUploadZone>
  );
});

export default Conversation;
