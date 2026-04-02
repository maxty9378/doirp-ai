'use client';

import { SESSION_CHAT_URL } from '@lobechat/const';
import { Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { message, Modal } from 'antd';
import { cssVar } from 'antd-style';
import { BotIcon } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import GroupBlock from '@/app/[variants]/(main)/home/features/components/GroupBlock';
import ScrollShadowWithButton from '@/app/[variants]/(main)/home/features/components/ScrollShadowWithButton';
import { HARD_NEGOTIATIONS_PRESETS, type InitialTrainingAgentPreset } from '@/config/initialAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsMobile } from '@/hooks/useIsMobile';
import { emitTrainingBannerUpdated } from '@/hooks/useTrainingBannerUrl';
import { useTrainingScenarios } from '@/hooks/useTrainingScenarios';
import { uploadService } from '@/services/upload';
import { getAgentStoreState } from '@/store/agent';
import { useSessionStore } from '@/store/session';
import { prefetchVoiceCallConfig } from '@/utils/voiceCallConfigCache';

import { compressImageForBanner } from './compressBannerImage';
import TrainingScenarioCard from './TrainingScenarioCard';

interface TrainingAgentsProps {
  compact?: boolean;
}

const toTrainingBannerUrl = (path: string) => {
  const normalizedPath = path.replace(/^\/+/, '').trim();
  const keyPrefix = 'voice-call/trainer-banner/';

  if (normalizedPath.startsWith(keyPrefix)) {
    const keyTail = normalizedPath.slice(keyPrefix.length);
    return `/webapi/voice-call/trainer-banner/${keyTail}`;
  }

  return `/webapi/${normalizedPath}`;
};

const TrainingAgents = memo<TrainingAgentsProps>(({ compact }) => {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  const isCompact = compact ?? isMobile;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hnBannerFileInputRef = useRef<HTMLInputElement | null>(null);
  const warmedVoiceScenariosRef = useRef(new Set<string>());
  const [hardNegotiationsModalOpen, setHardNegotiationsModalOpen] = useState(false);
  const [hardNegotiationsLoadingKey, setHardNegotiationsLoadingKey] = useState<string | null>(
    null,
  );
  const { isLoading: voiceScenariosLoading, scenarios: voiceScenarios } = useTrainingScenarios();
  const [voiceScenarioStartingKey, setVoiceScenarioStartingKey] = useState<string | null>(null);
  const createSession = useSessionStore((s) => s.createSession);

  const warmVoiceScenario = useCallback((key: string) => {
    const trimmedKey = key.trim();
    if (!trimmedKey || warmedVoiceScenariosRef.current.has(trimmedKey)) return;

    warmedVoiceScenariosRef.current.add(trimmedKey);

    void import('../../../voice-call');
    void import('../../../voice-call/_layout');
    void import('../../../voice-call/features/GeminiLiveCall');
    void prefetchVoiceCallConfig(trimmedKey);
  }, []);

  const openVoiceScenario = useCallback(
    (key: string, avatarUrl?: string | null) => {
      if (voiceScenarioStartingKey) return;

      setVoiceScenarioStartingKey(key);
      warmVoiceScenario(key);
      navigate(`/voice-call?agentId=${encodeURIComponent(key)}`, {
        state: { trainerAvatarUrl: avatarUrl || null },
      });
      setVoiceScenarioStartingKey(null);
    },
    [navigate, voiceScenarioStartingKey, warmVoiceScenario],
  );

  const openHardNegotiationSession = useCallback(
    async (preset: InitialTrainingAgentPreset) => {
      if (hardNegotiationsLoadingKey) return;

      setHardNegotiationsLoadingKey(preset.key);

      try {
        const sessionId = await createSession({
          config: {
            chatConfig: { enableAutoCreateTopic: true },
            model: preset.model || 'gemini-2.5-flash',
            openingMessage: preset.openingMessage,
            provider: preset.provider || 'google',
            systemRole: preset.systemRole,
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
          avatar: preset.avatar,
          backgroundColor: preset.backgroundColor,
          chatConfig: { enableAutoCreateTopic: true },
          id: sessionId,
          model: preset.model || 'gemini-2.5-flash',
          openingMessage: preset.openingMessage ?? undefined,
          provider: preset.provider || 'google',
          systemRole: preset.systemRole,
          title: preset.title,
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
    [createSession, hardNegotiationsLoadingKey, navigate],
  );

  const onSelectBannerFile = useCallback(async (file?: File | null) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      message.error('Нужно выбрать файл изображения');
      return;
    }

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
      message.success('Баннер успешно обновлен');
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Ошибка загрузки баннера';
      message.error(errorText);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const onSelectHnBannerFile = useCallback(async (file?: File | null) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      message.error('Нужно выбрать файл изображения');
      return;
    }

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
      message.success('Баннер успешно обновлен');
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Ошибка загрузки баннера';
      message.error(errorText);
    } finally {
      if (hnBannerFileInputRef.current) hnBannerFileInputRef.current.value = '';
    }
  }, []);

  const scenarioCards = voiceScenarios.map((scenario) => (
    <TrainingScenarioCard
      fullWidth={isCompact}
      key={scenario.key}
      loading={voiceScenarioStartingKey === scenario.key}
      scenario={scenario}
      onClick={() => openVoiceScenario(scenario.key, scenario.avatarUrl)}
      onWarmUp={() => warmVoiceScenario(scenario.key)}
    />
  ));

  const emptyState = !voiceScenariosLoading && voiceScenarios.length === 0 && (
    <Flexbox
      align="center"
      justify="center"
      style={{
        color: 'var(--colorTextSecondary)',
        padding: 24,
        width: isCompact ? '100%' : undefined,
      }}
    >
      <Text>Нет доступных тренажеров</Text>
    </Flexbox>
  );

  const content = (
    <>
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

      {isCompact ? (
        <Flexbox gap={12} width="100%">
          {scenarioCards}
          {emptyState}
        </Flexbox>
      ) : (
        <ScrollShadowWithButton>
          {scenarioCards}
          {emptyState}
        </ScrollShadowWithButton>
      )}

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
    </>
  );

  if (isCompact) {
    return (
      <Flexbox gap={16} width="100%">
        {content}
      </Flexbox>
    );
  }

  return (
    <GroupBlock icon={BotIcon} title="Тренажеры">
      {content}
    </GroupBlock>
  );
});

TrainingAgents.displayName = 'TrainingAgents';

export default TrainingAgents;
