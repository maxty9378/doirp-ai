'use client';

import { SESSION_CHAT_URL } from '@lobechat/const';
import { ActionIcon, Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { Dropdown, Modal, message } from 'antd';
import { cssVar } from 'antd-style';
import { BotIcon, MoreVertical, Upload } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import TrainingScenarioCard, {
  type TrainingScenarioFromApi,
} from './TrainingScenarioCard';

const FIELD_FIGHTER_MARKET_ID = 'training-tp-price-objection';
const FIELD_FIGHTER_AGENT_ID = 'training-tp-price-objection';
const GFD_STRESS_KEY = 'training-gfd-stress';

/** Обложка GFD — статический файл из public */
const GFD_COVER_IMAGE = '/images/voice-call/gfd-cover.png';

/** Карточка GFD всегда показывается (даже если API не вернул сценарии) */
const GFD_STRESS_FALLBACK: TrainingScenarioFromApi = {
  key: GFD_STRESS_KEY,
  title: 'GFD: Стресс‑интервью на выставке',
  description:
    'Публичное интервью на выставке: провокационная журналистка проверяет маркетолога GFD на стрессоустойчивость.',
  bannerUrl: GFD_COVER_IMAGE,
};

const TRAINING_CARD_WIDTH = 380;
const TRAINING_CARD_WITH_BANNER_MIN_HEIGHT = 320;
const TRAINING_BANNER_FALLBACK_COVER = '/images/voice-call/field-fighter-cover.svg';

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
  const [voiceScenarios, setVoiceScenarios] = useState<TrainingScenarioFromApi[]>([]);
  const [voiceScenariosLoading, setVoiceScenariosLoading] = useState(true);
  const [voiceScenarioStartingKey, setVoiceScenarioStartingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVoiceScenariosLoading(true);
    fetch('/api/training/scenarios', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { scenarios: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.scenarios)) {
          setVoiceScenarios(
            data.scenarios.map((s: { key: string; title: string; description?: string; bannerUrl?: string }) => ({
              key: s.key,
              title: s.title,
              description: s.description ?? null,
              bannerUrl: s.bannerUrl ?? null,
            })),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setVoiceScenariosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openVoiceScenario = useCallback(
    (key: string) => {
      if (voiceScenarioStartingKey) return;
      setVoiceScenarioStartingKey(key);
      navigate(`/voice-call?agentId=${encodeURIComponent(key)}`);
      setVoiceScenarioStartingKey(null);
    },
    [navigate, voiceScenarioStartingKey],
  );

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
    <GroupBlock icon={BotIcon} title="Тренажеры">
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
        {/* GFD — всегда первый и сразу, без ожидания API; остальные сценарии не показываем (не листаются, не активны) */}
        {(() => {
          const gfdFromApi = voiceScenarios.find((s) => s.key === GFD_STRESS_KEY);
          const gfdScenario = gfdFromApi ?? GFD_STRESS_FALLBACK;
          return (
            <TrainingScenarioCard
              key={gfdScenario.key}
              loading={voiceScenarioStartingKey === gfdScenario.key}
              scenario={gfdScenario}
              onClick={() => openVoiceScenario(gfdScenario.key)}
            />
          );
        })()}

        {INITIAL_TRAINING_AGENT_PRESETS.filter(
          (preset) => preset.marketIdentifier === FIELD_FIGHTER_MARKET_ID,
        ).map((preset) => (
          <TrainingAgentItem
            inDevelopment
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
          clickable={false}
          flex={'none'}
          justify={'space-between'}
          variant={'filled'}
          width={TRAINING_CARD_WIDTH}
          style={{
            backgroundColor: cssVar.colorFillQuaternary,
            borderRadius: cssVar.borderRadiusLG,
            cursor: 'not-allowed',
            minHeight: TRAINING_CARD_WITH_BANNER_MIN_HEIGHT,
            opacity: 0.45,
            filter: 'grayscale(0.85)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              aspectRatio: '16 / 9',
              backgroundImage: `url(${hnBannerUrl}), url(${TRAINING_BANNER_FALLBACK_COVER})`,
              backgroundPosition: 'center, center',
              backgroundRepeat: 'no-repeat, no-repeat',
              backgroundSize: 'cover, cover',
              borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
              position: 'relative',
              width: '100%',
            }}
          >
            <span
              style={{
                backdropFilter: 'blur(6px)',
                background:
                  'linear-gradient(135deg, rgba(16, 185, 129, 0.96) 0%, rgba(5, 150, 105, 0.96) 100%)',
                border: '1px solid rgba(167, 243, 208, 0.65)',
                borderRadius: 999,
                color: '#ecfdf5',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '5px 10px',
                position: 'absolute',
                left: 10,
                textTransform: 'uppercase',
                top: 10,
                zIndex: 5,
              }}
            >
              В разработке
            </span>
            {isAdmin && (
              <div
                style={{ position: 'absolute', right: 4, top: 4, zIndex: 10 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Dropdown
                  placement="bottomRight"
                  trigger={['click']}
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

          <Flexbox horizontal align={'flex-start'} gap={10} paddingBlock={10} paddingInline={12}>
            <Flexbox flex={1} gap={3} style={{ minWidth: 0 }}>
              <Text fontSize={14} style={{ lineHeight: '20px', minHeight: 20 }} weight={600}>
                Жесткие переговоры
              </Text>
              <Text
                color={cssVar.colorTextSecondary}
                fontSize={13}
                style={{
                  display: '-webkit-box',
                  lineHeight: '18px',
                  minHeight: 36,
                  overflow: 'hidden',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                }}
              >
                Управленческие поединки в чате
              </Text>
              <Text fontSize={12} style={{ lineHeight: '16px', minHeight: 16 }} type={'secondary'}>
                В разработке
              </Text>
            </Flexbox>
            <Avatar
              emojiScaleWithBackground
              avatar={'\u2694\uFE0F'}
              background="#722ED1"
              shape={'square'}
              size={32}
              style={{ alignSelf: 'flex-start', flex: 'none', marginTop: 2 }}
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
