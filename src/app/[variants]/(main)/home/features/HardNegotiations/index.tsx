'use client';

import { SESSION_CHAT_URL } from '@lobechat/const';
import { App } from 'antd';
import { Swords } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import GroupBlock from '@/app/[variants]/(main)/home/features/components/GroupBlock';
import ScrollShadowWithButton from '@/app/[variants]/(main)/home/features/components/ScrollShadowWithButton';
import { HARD_NEGOTIATIONS_PRESETS, type InitialTrainingAgentPreset } from '@/config/initialAgents';
import { useSessionStore } from '@/store/session';

import HardNegotiationItem from './Item';

const HardNegotiations = memo(() => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);
  const createSession = useSessionStore((s) => s.createSession);

  const openOrCreateAgent = useCallback(
    async (preset: InitialTrainingAgentPreset) => {
      if (activePresetKey) return;

      setActivePresetKey(preset.key);
      try {
        const sessionId = await createSession({
          config: {
            systemRole: preset.systemRole,
            model: preset.model || 'gemini-2.5-pro',
            provider: preset.provider || 'google',
            openingMessage: preset.openingMessage,
            chatConfig: {
              enableAutoCreateTopic: true,
            },
          },
          meta: {
            avatar: preset.avatar,
            backgroundColor: preset.backgroundColor,
            description: preset.description,
            title: preset.title,
          },
        });
        navigate(SESSION_CHAT_URL(sessionId, false));
      } catch (error) {
        console.error('Failed to start hard negotiations agent:', error);
        message.error('Не удалось запустить тренажер');
      } finally {
        setActivePresetKey(null);
      }
    },
    [activePresetKey, message, navigate, createSession],
  );

  return (
    <GroupBlock icon={Swords} title='Тренажер "Жесткие переговоры"'>
      <ScrollShadowWithButton>
        {HARD_NEGOTIATIONS_PRESETS.map((preset) => (
          <HardNegotiationItem
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

export default HardNegotiations;
