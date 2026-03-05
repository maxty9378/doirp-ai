'use client';

import { SESSION_CHAT_URL } from '@lobechat/const';
import { ActionIcon, Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { App, Dropdown, Modal } from 'antd';
import { cssVar } from 'antd-style';
import { BotIcon, MoreVertical, Upload } from 'lucide-react';
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
import { emitTrainingBannerUpdated, useTrainingBannerUrl } from '@/hooks/useTrainingBannerUrl';
import { agentService } from '@/services/agent';
import { uploadService } from '@/services/upload';
import { getAgentStoreState } from '@/store/agent';
import { useSessionStore } from '@/store/session';

import { compressImageForBanner } from './compressBannerImage';
import TrainingAgentItem from './Item';

const FIELD_FIGHTER_MARKET_ID = 'training-tp-price-objection';
const FIELD_FIGHTER_AGENT_ID = 'training-tp-price-objection';
const TRAINING_CARD_WIDTH = 380;
const TRAINING_CARD_WITH_BANNER_MIN_HEIGHT = 320;

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
  const hnBannerFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isHnBannerUploading, setIsHnBannerUploading] = useState(false);
  const hnBannerUrl = useTrainingBannerUrl('hn');

  const openHardNegotiationSession = useCallback(
    async (preset: InitialTrainingAgentPreset) => {
      if (hardNegotiationsLoadingKey) return;
      setHardNegotiationsLoadingKey(preset.key);

      try {
        const sessionId = await createSession({
          config: {
            systemRole: preset.systemRole,
            model: preset.model || 'gemini-2.5-flash',
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

        // Сразу подставляем конфиг в store, чтобы чат не показывал пустое состояние до ответа API.
        getAgentStoreState().internal_dispatchAgentMap(sessionId, {
          id: sessionId,
          systemRole: preset.systemRole,
          model: preset.model || 'gemini-2.5-flash',
          provider: preset.provider || 'google',
          openingMessage: preset.openingMessage ?? undefined,
          chatConfig: { enableAutoCreateTopic: true },
          avatar: preset.avatar,
          backgroundColor: preset.backgroundColor,
          title: preset.title,
        });

        setHardNegotiationsModalOpen(false);
        navigate(SESSION_CHAT_URL(sessionId, false));
      } catch (error) {
        console.error('Failed to start hard negotiations agent:', error);
        message.error('Не удалось запустить тренажёр');
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
        message.error('Не удалось запустить тренажёр');
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
        const compressed = await compressImageForBanner(file);
        const { data } = await uploadService.uploadFileToS3(compressed, {
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
        message.success('Баннер успешно обновлён');
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

  const onSelectHnBannerFile = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        message.error('Нужно выбрать файл изображения');
        return;
      }

      setIsHnBannerUploading(true);
      try {
        const compressed = await compressImageForBanner(file);
        const { data } = await uploadService.uploadFileToS3(compressed, {
          directory: 'voice-call/trainer-banner',
        });
        const uploadedUrl = toTrainingBannerUrl(data.path);

        const res = await fetch('/api/admin/training-banner', {
          body: JSON.stringify({ key: 'hn', url: uploadedUrl }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || 'Не удалось сохранить баннер');
        }

        emitTrainingBannerUpdated(uploadedUrl, 'hn');
        message.success('Баннер успешно обновлён');
      } catch (error) {
        const errorText = error instanceof Error ? error.message : 'Ошибка загрузки баннера';
        message.error(errorText);
      } finally {
        setIsHnBannerUploading(false);
        if (hnBannerFileInputRef.current) hnBannerFileInputRef.current.value = '';
      }
    },
    [message],
  );

  return (
    <GroupBlock icon={BotIcon} title="Доступные тренажёры">
      {isAdmin && (
        <>
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
          <input
            accept="image/*"
            ref={hnBannerFileInputRef}
            style={{ display: 'none' }}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              void onSelectHnBannerFile(file);
            }}
          />
        </>
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
          justify={'space-between'}
          variant={'filled'}
          width={TRAINING_CARD_WIDTH}
          style={{
            backgroundColor: cssVar.colorFillQuaternary,
            borderRadius: cssVar.borderRadiusLG,
            cursor: 'pointer',
            minHeight: TRAINING_CARD_WITH_BANNER_MIN_HEIGHT,
            overflow: 'hidden',
          }}
          onClick={() => setHardNegotiationsModalOpen(true)}
        >
          <div
            style={{
              aspectRatio: '16 / 9',
              backgroundImage: `url(${hnBannerUrl})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
              position: 'relative',
              width: '100%',
            }}
          >
            {isAdmin && (
              <div
                style={{ position: 'absolute', right: 4, top: 4, zIndex: 10 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Dropdown
                  menu={{
                    items: [
                      {
                        icon: <Upload size={14} />,
                        key: 'update-banner',
                        label: 'Обновить баннер',
                        onClick: (e) => {
                          e.domEvent.stopPropagation();
                          hnBannerFileInputRef.current?.click();
                        },
                      },
                    ],
                  }}
                  placement="bottomRight"
                  trigger={['click']}
                >
                  <ActionIcon
                    icon={MoreVertical}
                    loading={isHnBannerUploading}
                    size={{ blockSize: 24, borderRadius: 8 }}
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      backdropFilter: 'blur(4px)',
                      color: '#fff',
                      fontSize: 14,
                    }}
                  />
                </Dropdown>
              </div>
            )}
          </div>

          <Flexbox horizontal align={'center'} gap={8} paddingBlock={8} paddingInline={12}>
            <Flexbox flex={1} gap={1} style={{ overflow: 'hidden' }}>
              <Text fontSize={13} weight={500}>
                Жесткие переговоры
              </Text>
              <Text color={cssVar.colorTextSecondary} fontSize={13}>
                Управленческие поединки в чате
              </Text>
              <Text fontSize={12} type={'secondary'}>
                Нажмите, чтобы выбрать режим
              </Text>
            </Flexbox>
            <Avatar
              emojiScaleWithBackground
              avatar="⚔️"
              background="#722ED1"
              shape={'square'}
              size={30}
              style={{ flex: 'none' }}
            />
          </Flexbox>
        </Block>
      </ScrollShadowWithButton>

      <Modal
        footer={null}
        open={hardNegotiationsModalOpen}
        title="Выберите режим"
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