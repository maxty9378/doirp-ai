'use client';

import { SESSION_CHAT_URL } from '@lobechat/const';
import { Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { App, Modal } from 'antd';
import { cssVar } from 'antd-style';
import { BotIcon } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import GroupBlock from '@/app/[variants]/(main)/home/features/components/GroupBlock';
import ScrollShadowWithButton from '@/app/[variants]/(main)/home/features/components/ScrollShadowWithButton';
import {
  HARD_NEGOTIATIONS_PRESETS,
  INITIAL_TRAINING_AGENT_PRESETS,
  type InitialTrainingAgentPreset,
} from '@/config/initialAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { emitTrainingBannerUpdated } from '@/hooks/useTrainingBannerUrl';
import { agentService } from '@/services/agent';
import { uploadService } from '@/services/upload';
import { useSessionStore } from '@/store/session';

import TrainingAgentItem from './Item';

const FIELD_FIGHTER_MARKET_ID = 'training-tp-price-objection';
const FIELD_FIGHTER_AGENT_ID = 'training-tp-price-objection';
const TRAINING_CARD_WIDTH = 380;
const TRAINING_CARD_MIN_HEIGHT = 120;

const toTrainingBannerUrl = (path: string) => {
  const normalizedPath = path.replace(/^\/+/, '').trim();
  const keyPrefix = 'voice-call/trainer-banner/';

  if (normalizedPath.startsWith(keyPrefix)) {
    const keyTail = normalizedPath.slice(keyPrefix.length);
    return `/webapi/voice-call/trainer-banner/${keyTail}`;
  }

  return `/webapi/${normalizedPath}`;
};

const TrainingAgents = memo(() => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const isAdmin = useIsAdmin();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);
  const [isBannerUploading, setIsBannerUploading] = useState(false);
  const [hardNegotiationsModalOpen, setHardNegotiationsModalOpen] = useState(false);
  const [hardNegotiationsLoadingKey, setHardNegotiationsLoadingKey] = useState<string | null>(null);
  const createSession = useSessionStore((s) => s.createSession);

  const openHardNegotiationSession = useCallback(
    async (preset: InitialTrainingAgentPreset) => {
      if (hardNegotiationsLoadingKey) return;
      setHardNegotiationsLoadingKey(preset.key);
      try {
        const sessionId = await createSession({
          config: {
            systemRole: preset.systemRole,
            model: preset.model || 'gemini-2.5-pro',
            provider: preset.provider || 'google',
            openingMessage: preset.openingMessage,
            chatConfig: { enableAutoCreateTopic: true },
          },
          meta: {
            avatar: preset.avatar,
            backgroundColor: preset.backgroundColor,
            description: preset.description,
            title: preset.title,
          },
        });
        setHardNegotiationsModalOpen(false);
        navigate(SESSION_CHAT_URL(sessionId, false));
      } catch (error) {
        console.error('Failed to start hard negotiations agent:', error);
        message.error('Не удалось запустить тренажер');
      } finally {
        setHardNegotiationsLoadingKey(null);
      }
    },
    [hardNegotiationsLoadingKey, message, navigate, createSession],
  );

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
        message.error('Не удалось запустить тренажер');
      } finally {
        setActivePresetKey(null);
      }
    },
    [activePresetKey, message, navigate],
  );

  const onSelectBannerFile = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        message.error('Нужно выбрать файл изображения');
        return;
      }

      setIsBannerUploading(true);
      try {
        const { data } = await uploadService.uploadFileToS3(file, {
          directory: 'voice-call/trainer-banner',
        });
        const uploadedUrl = toTrainingBannerUrl(data.path);

        const res = await fetch('/api/admin/training-banner', {
          body: JSON.stringify({ url: uploadedUrl }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'Не удалось сохранить баннер');
        }

        emitTrainingBannerUpdated(uploadedUrl);
        message.success('Баннер успешно обновлен');
      } catch (error) {
        const errorText = error instanceof Error ? error.message : 'Ошибка загрузки баннера';
        message.error(errorText);
      } finally {
        setIsBannerUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [message],
  );

  return (
    <GroupBlock icon={BotIcon} title="Доступные тренажёры">
      {isAdmin && (
        <input
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            void onSelectBannerFile(file);
          }}
        />
      )}
      <ScrollShadowWithButton>
        {INITIAL_TRAINING_AGENT_PRESETS.filter(
          (preset) => preset.marketIdentifier === FIELD_FIGHTER_MARKET_ID,
        ).map((preset) => (
          <TrainingAgentItem
            isAdmin={isAdmin}
            isUploadingBanner={isBannerUploading}
            key={preset.key}
            loading={activePresetKey === preset.key}
            preset={preset}
            onUpdateBanner={() => fileInputRef.current?.click()}
            onClick={() => {
              void openOrCreateAgent(preset);
            }}
          />
        ))}
        <Block
          clickable
          flex={'none'}
          variant={'filled'}
          width={TRAINING_CARD_WIDTH}
          style={{
            backgroundColor: cssVar.colorFillQuaternary,
            borderRadius: cssVar.borderRadiusLG,
            cursor: 'pointer',
            minHeight: TRAINING_CARD_MIN_HEIGHT,
            overflow: 'hidden',
          }}
          onClick={() => setHardNegotiationsModalOpen(true)}
        >
          <Flexbox horizontal align={'center'} gap={8} paddingBlock={16} paddingInline={16}>
            <Flexbox flex={1} gap={2} style={{ overflow: 'hidden' }}>
              <Text fontSize={15} weight={600}>
                Жесткие переговоры
              </Text>
              <Text color={cssVar.colorTextSecondary} fontSize={13}>
                Управленческие поединки в чате
              </Text>
              <Text fontSize={12} style={{ marginTop: 4 }} type={'secondary'}>
                Нажмите, чтобы выбрать режим
              </Text>
            </Flexbox>
            <Avatar
              emojiScaleWithBackground
              avatar="⚔️"
              background="#722ED1"
              shape={'square'}
              size={48}
              style={{ flex: 'none' }}
            />
          </Flexbox>
        </Block>
      </ScrollShadowWithButton>
      <Modal
        footer={null}
        open={hardNegotiationsModalOpen}
        title={'Выберите режим'}
        width={440}
        onCancel={() => setHardNegotiationsModalOpen(false)}
      >
        <Flexbox gap={8} style={{ marginTop: 8 }}>
          {HARD_NEGOTIATIONS_PRESETS.map((preset) => (
            <Block
              clickable
              key={preset.key}
              variant={'filled'}
              style={{
                backgroundColor: cssVar.colorFillQuaternary,
                borderRadius: cssVar.borderRadiusLG,
                cursor: hardNegotiationsLoadingKey ? 'wait' : 'pointer',
                opacity: hardNegotiationsLoadingKey === preset.key ? 0.7 : 1,
                padding: 12,
              }}
              onClick={() => {
                void openHardNegotiationSession(preset);
              }}
            >
              <Flexbox horizontal align={'center'} gap={12}>
                <Avatar
                  emojiScaleWithBackground
                  avatar={preset.avatar || DEFAULT_AVATAR}
                  background={preset.backgroundColor || undefined}
                  shape={'square'}
                  size={40}
                />
                <Flexbox flex={1} gap={2} style={{ overflow: 'hidden' }}>
                  <Text fontSize={14} weight={600}>
                    {preset.title}
                  </Text>
                  <Text color={cssVar.colorTextSecondary} fontSize={12}>
                    {preset.description}
                  </Text>
                </Flexbox>
              </Flexbox>
            </Block>
          ))}
        </Flexbox>
      </Modal>
    </GroupBlock>
  );
});

export default TrainingAgents;
