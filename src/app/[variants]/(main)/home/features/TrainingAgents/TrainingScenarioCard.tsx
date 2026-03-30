'use client';

import { Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

const TRAINING_CARD_WIDTH = 380;
const TRAINING_CARD_MIN_HEIGHT = 320;
const DEFAULT_AVATAR = '/images/voice-call/trainer-ai-mic.svg';
const BANNER_FALLBACK = '/images/voice-call/trainer-ai-mic.svg';

export interface TrainingScenarioFromApi {
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  key: string;
  title: string;
}

interface TrainingScenarioCardProps {
  fullWidth?: boolean;
  loading?: boolean;
  onClick?: () => void;
  scenario: TrainingScenarioFromApi;
}

const TrainingScenarioCard = memo<TrainingScenarioCardProps>(
  ({ scenario, onClick, loading, fullWidth }) => {
    const bannerUrl = scenario.bannerUrl?.trim() || null;
    const avatarUrl = scenario.avatarUrl?.trim() || null;
    const title = scenario.title || 'Тренажёр';
    const description = scenario.description || 'Голосовой тренажёр. Нажмите, чтобы начать.';

    return (
      <Block
        clickable
        flex={'none'}
        justify={'space-between'}
        variant={'filled'}
        width={fullWidth ? '100%' : TRAINING_CARD_WIDTH}
        style={{
          backgroundColor: cssVar.colorFillQuaternary,
          borderRadius: cssVar.borderRadiusLG,
          cursor: loading ? 'wait' : 'pointer',
          minHeight: fullWidth ? 260 : TRAINING_CARD_MIN_HEIGHT,
          opacity: loading ? 0.7 : 1,
          overflow: 'hidden',
        }}
        onClick={loading ? undefined : onClick}
      >
        <div
          style={{
            aspectRatio: '16 / 9',
            backgroundImage: bannerUrl ? `url(${bannerUrl})` : `url(${BANNER_FALLBACK})`,
            backgroundPosition: 'center, center',
            backgroundRepeat: 'no-repeat, no-repeat',
            backgroundSize: bannerUrl ? 'cover, cover' : 'cover, 88px',
            borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
            position: 'relative',
            width: '100%',
          }}
        />
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
              {loading ? 'Запуск...' : 'Нажмите, чтобы начать'}
            </Text>
          </Flexbox>
          <Avatar
            avatar={avatarUrl || DEFAULT_AVATAR}
            size={40}
            style={{ alignSelf: 'flex-start', flex: 'none', marginTop: 2 }}
          />
        </Flexbox>
      </Block>
    );
  },
);

TrainingScenarioCard.displayName = 'TrainingScenarioCard';

export default TrainingScenarioCard;
