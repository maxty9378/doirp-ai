'use client';

import { App } from 'antd';
import { BotIcon } from 'lucide-react';
import qs from 'query-string';
import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import GroupBlock from '@/app/[variants]/(main)/home/features/components/GroupBlock';
import ScrollShadowWithButton from '@/app/[variants]/(main)/home/features/components/ScrollShadowWithButton';
import {
  INITIAL_TRAINING_AGENT_PRESETS,
  type InitialTrainingAgentPreset,
} from '@/config/initialAgents';
import { SESSION_CHAT_URL } from '@/const/url';
import { agentService } from '@/services/agent';
import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';

import TrainingAgentItem from './Item';

const TRAINING_FAST_CHAT_CONFIG = {
  enableReasoning: false,
  enableReasoningEffort: false,
  thinkingBudget: 0,
  reasoningEffort: 'low' as const,
  thinking: 'disabled' as const,
};
const FIELD_FIGHTER_MARKET_ID = 'training-tp-price-objection';

const TrainingAgents = memo(() => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [createAgent, updateAgentConfigById] = useAgentStore((s) => [
    s.createAgent,
    s.updateAgentConfigById,
  ]);
  const refreshAgentList = useHomeStore((s) => s.refreshAgentList);
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);

  const openOrCreateAgent = useCallback(
    async (preset: InitialTrainingAgentPreset) => {
      if (activePresetKey) return;

      setActivePresetKey(preset.key);
      try {
        let targetId: string | null = null;
        if (preset.marketIdentifier) {
          targetId = await agentService.getAgentByMarketIdentifier(preset.marketIdentifier);
        }

        if (!targetId) {
          const result = await createAgent({
            config: {
              avatar: preset.avatar,
              backgroundColor: preset.backgroundColor,
              chatConfig: TRAINING_FAST_CHAT_CONFIG,
              description: preset.description,
              marketIdentifier: preset.marketIdentifier,
              model: preset.model,
              openingMessage: preset.openingMessage,
              provider: preset.provider,
              systemRole: preset.systemRole,
              tags: ['training', 'simulator'],
              title: preset.title,
            },
          });

          targetId = result.agentId || result.sessionId;
          await refreshAgentList();
          message.success('Тренажер готов');
        } else {
          await updateAgentConfigById(targetId, {
            chatConfig: TRAINING_FAST_CHAT_CONFIG,
            model: preset.model,
            provider: preset.provider,
          });
        }

        const initialMessage = preset.initialUserMessage || 'Начни тренировку';
        const targetUrl = qs.stringifyUrl({
          query: { hiddenKickoff: '1', message: initialMessage },
          url: SESSION_CHAT_URL(targetId),
        });
        navigate(targetUrl);
      } catch (error) {
        console.error('Failed to start training agent:', error);
        message.error('Не удалось запустить тренажер');
      } finally {
        setActivePresetKey(null);
      }
    },
    [activePresetKey, createAgent, message, navigate, refreshAgentList, updateAgentConfigById],
  );

  return (
    <GroupBlock icon={BotIcon} title="Доступные тренажеры">
      <ScrollShadowWithButton>
        {INITIAL_TRAINING_AGENT_PRESETS.filter(
          (preset) => preset.marketIdentifier === FIELD_FIGHTER_MARKET_ID,
        ).map((preset) => (
          <TrainingAgentItem
            key={preset.key}
            loading={activePresetKey === preset.key}
            preset={preset}
            onClick={() => {
              void openOrCreateAgent(preset);
            }}
          />
        ))}
      </ScrollShadowWithButton>
    </GroupBlock>
  );
});

export default TrainingAgents;
