import { Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

import { type InitialTrainingAgentPreset } from '@/config/initialAgents';
import { DEFAULT_AVATAR } from '@/const/meta';

const TRAINING_CARD_WIDTH = 380;
const TRAINING_CARD_MIN_HEIGHT = 320;
const FIELD_FIGHTER_MARKET_ID = 'training-tp-price-objection';
const FIELD_FIGHTER_COVER =
  '/images/voice-call/gemini-image-2_A_high-resolution_photo_from_a_cinematic_banner_angle._Inside_a_modern_well-lit_-0.jpg';
const FIELD_FIGHTER_ICON = '/images/voice-call/trainer-ai-mic.svg';

interface TrainingAgentItemProps {
  loading?: boolean;
  onClick?: () => void;
  preset: InitialTrainingAgentPreset;
}

const TrainingAgentItem = memo<TrainingAgentItemProps>(({ preset, onClick, loading }) => {
  const isFieldFighter = preset.marketIdentifier === FIELD_FIGHTER_MARKET_ID;

  const title = isFieldFighter ? 'Полевой боец: Дорого' : preset.title;
  const description = isFieldFighter
    ? 'Тренажер для ТП по отработке возражения "Дорого / у конкурентов дешевле".'
    : preset.description || 'Описание тренажера';

  return (
    <Block
      clickable
      flex={'none'}
      justify={'space-between'}
      variant={'filled'}
      width={TRAINING_CARD_WIDTH}
      style={{
        backgroundColor: cssVar.colorFillQuaternary,
        borderRadius: cssVar.borderRadiusLG,
        cursor: loading ? 'wait' : 'pointer',
        minHeight: TRAINING_CARD_MIN_HEIGHT,
        opacity: loading ? 0.7 : 1,
        overflow: 'hidden',
      }}
      onClick={loading ? undefined : onClick}
    >
      {isFieldFighter && (
        <div
          style={{
            aspectRatio: '16 / 9',
            backgroundImage: `url(${FIELD_FIGHTER_COVER})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
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
              right: 10,
              textTransform: 'uppercase',
              top: 10,
            }}
          >
            В разработке
          </span>
        </div>
      )}

      <Flexbox horizontal align={'center'} gap={8} paddingBlock={8} paddingInline={12}>
        <Flexbox flex={1} gap={1} style={{ overflow: 'hidden' }}>
          <Text fontSize={13} weight={500}>
            {title}
          </Text>
          <Text color={cssVar.colorTextSecondary} fontSize={13}>
            {description}
          </Text>
          <Text fontSize={12} type={'secondary'}>
            {loading ? 'Запуск...' : 'Нажмите, чтобы начать'}
          </Text>
        </Flexbox>
        {isFieldFighter ? (
          <img
            alt="Иконка тренажера"
            src={FIELD_FIGHTER_ICON}
            style={{ flex: 'none', height: 40, width: 40 }}
          />
        ) : (
          <Avatar
            emojiScaleWithBackground
            avatar={preset.avatar || DEFAULT_AVATAR}
            background={preset.backgroundColor || undefined}
            shape={'square'}
            size={30}
            style={{ flex: 'none' }}
          />
        )}
      </Flexbox>
    </Block>
  );
});

export default TrainingAgentItem;
