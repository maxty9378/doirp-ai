import { ActionIcon, Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { Dropdown, type MenuProps } from 'antd';
import { cssVar } from 'antd-style';
import { MoreVertical, Upload } from 'lucide-react';
import { memo } from 'react';

import { type InitialTrainingAgentPreset } from '@/config/initialAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useTrainingBannerUrl } from '@/hooks/useTrainingBannerUrl';

const TRAINING_CARD_WIDTH = 380;
const TRAINING_CARD_MIN_HEIGHT = 320;
const FIELD_FIGHTER_MARKET_ID = 'training-tp-price-objection';
const FIELD_FIGHTER_ICON = '/images/voice-call/trainer-ai-mic.svg';
const TRAINING_BANNER_FALLBACK_ICON = '/images/voice-call/trainer-ai-mic.svg';

interface TrainingAgentItemProps {
  fullWidth?: boolean;
  inDevelopment?: boolean;
  isAdmin?: boolean;
  isUploadingBanner?: boolean;
  loading?: boolean;
  onClick?: () => void;
  onUpdateBanner?: () => void;
  preset: InitialTrainingAgentPreset;
}

const TrainingAgentItem = memo<TrainingAgentItemProps>(
  ({
    preset,
    onClick,
    loading,
    isAdmin,
    isUploadingBanner,
    onUpdateBanner,
    inDevelopment,
    fullWidth,
  }) => {
    const isFieldFighter = preset.marketIdentifier === FIELD_FIGHTER_MARKET_ID;
    const trainerBannerUrl = useTrainingBannerUrl();

    const title = isFieldFighter ? 'Полевой боец: Дорого' : preset.title;
    const description = isFieldFighter
      ? 'Тренажер для ТП по отработке возражения "Дорого / у конкурентов дешевле".'
      : preset.description || 'Описание тренажера';

    const menuItems: MenuProps['items'] = [
      {
        icon: <Upload size={14} />,
        key: 'update-banner',
        label: 'Обновить баннер',
        onClick: (e) => {
          e.domEvent.stopPropagation();
          onUpdateBanner?.();
        },
      },
    ];

    const disabled = inDevelopment || loading;

    return (
      <Block
        clickable={!disabled}
        flex={'none'}
        justify={'space-between'}
        variant={'filled'}
        width={fullWidth ? '100%' : TRAINING_CARD_WIDTH}
        style={{
          backgroundColor: cssVar.colorFillQuaternary,
          borderRadius: cssVar.borderRadiusLG,
          cursor: disabled ? 'not-allowed' : loading ? 'wait' : 'pointer',
          minHeight: fullWidth ? 260 : TRAINING_CARD_MIN_HEIGHT,
          opacity: disabled ? 0.45 : loading ? 0.7 : 1,
          filter: disabled ? 'grayscale(0.85)' : undefined,
          overflow: 'hidden',
        }}
        onClick={disabled ? undefined : onClick}
      >
        {isFieldFighter && (
          <div
            style={{
              aspectRatio: '16 / 9',
              backgroundImage: `url(${trainerBannerUrl}), url(${TRAINING_BANNER_FALLBACK_ICON})`,
              backgroundPosition: 'center, center',
              backgroundRepeat: 'no-repeat, no-repeat',
              backgroundSize: 'cover, 88px',
              borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
              position: 'relative',
              width: '100%',
            }}
          >
            {isAdmin && !inDevelopment && (
              <div
                style={{ position: 'absolute', right: 4, top: 4, zIndex: 10 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
                  <ActionIcon
                    icon={MoreVertical}
                    loading={isUploadingBanner}
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
            {inDevelopment && (
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
                }}
              >
                В разработке
              </span>
            )}
          </div>
        )}

        <Flexbox horizontal align={'flex-start'} gap={10} paddingBlock={10} paddingInline={12}>
          <Flexbox flex={1} gap={3} style={{ minWidth: 0 }}>
            <Text
              fontSize={14}
              style={{ lineHeight: '20px', minHeight: 20 }}
              title={title}
              weight={600}
            >
              {title}
            </Text>
            <Text
              color={cssVar.colorTextSecondary}
              fontSize={13}
              title={description}
              style={{
                display: '-webkit-box',
                lineHeight: '18px',
                minHeight: 36,
                overflow: 'hidden',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
              }}
            >
              {description}
            </Text>
            <Text fontSize={12} style={{ lineHeight: '16px', minHeight: 16 }} type={'secondary'}>
              {inDevelopment ? 'В разработке' : loading ? 'Запуск...' : 'Нажмите, чтобы начать'}
            </Text>
          </Flexbox>
          {isFieldFighter ? (
            <img
              alt="Иконка тренажера"
              src={FIELD_FIGHTER_ICON}
              style={{ alignSelf: 'flex-start', flex: 'none', height: 40, marginTop: 2, width: 40 }}
            />
          ) : (
            <Avatar
              emojiScaleWithBackground
              avatar={preset.avatar || DEFAULT_AVATAR}
              background={preset.backgroundColor || undefined}
              shape={'square'}
              size={32}
              style={{ alignSelf: 'flex-start', flex: 'none', marginTop: 2 }}
            />
          )}
        </Flexbox>
      </Block>
    );
  },
);

export default TrainingAgentItem;
