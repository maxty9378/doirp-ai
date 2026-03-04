'use client';

import { App } from 'antd';
import { BotIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import GroupBlock from '@/app/[variants]/(main)/home/features/components/GroupBlock';
import ScrollShadowWithButton from '@/app/[variants]/(main)/home/features/components/ScrollShadowWithButton';
import {
  INITIAL_TRAINING_AGENT_PRESETS,
  type InitialTrainingAgentPreset,
} from '@/config/initialAgents';
import { agentService } from '@/services/agent';

import TrainingAgentItem from './Item';

const FIELD_FIGHTER_MARKET_ID = 'training-tp-price-objection';
const FIELD_FIGHTER_AGENT_ID = 'training-tp-price-objection';

const TrainingAgents = memo(() => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);

  const openOrCreateAgent = useCallback(
    async (preset: InitialTrainingAgentPreset) => {
      if (activePresetKey) return;

      setActivePresetKey(preset.key);
      try {
        if (preset.marketIdentifier) {
          const legacyAgentId = await agentService.getAgentByMarketIdentifier(
            preset.marketIdentifier,
          );
          if (legacyAgentId) {
            await agentService.removeAgent(legacyAgentId);
          }
        }

        navigate(`/voice-call?agentId=${FIELD_FIGHTER_AGENT_ID}`);
      } catch (error) {
        console.error('Failed to start training agent:', error);
        message.error('Не удалось запустить созвон');
      } finally {
        setActivePresetKey(null);
      }
    },
    [activePresetKey, message, navigate],
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
