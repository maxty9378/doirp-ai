import { Avatar, Block, Flexbox, Text } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';

import { type InitialTrainingAgentPreset } from '@/config/initialAgents';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useIsDark } from '@/hooks/useIsDark';

const TRAINING_CARD_WIDTH = 320;
const TRAINING_CARD_MIN_HEIGHT = 190;

interface TrainingAgentItemProps {
  loading?: boolean;
  onClick?: () => void;
  preset: InitialTrainingAgentPreset;
}

const TrainingAgentItem = memo<TrainingAgentItemProps>(({ preset, onClick, loading }) => {
  const isDarkMode = useIsDark();

  return (
    <Block
      clickable
      flex={'none'}
      justify={'space-between'}
      minHeight={TRAINING_CARD_MIN_HEIGHT}
      variant={'filled'}
      width={TRAINING_CARD_WIDTH}
      style={{
        backgroundColor: cssVar.colorFillQuaternary,
        borderRadius: cssVar.borderRadiusLG,
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.7 : 1,
        overflow: 'hidden',
      }}
      onClick={loading ? undefined : onClick}
    >
      <Block
        flex={1}
        padding={12}
        variant={'outlined'}
        style={{
          backgroundColor: isDarkMode ? cssVar.colorFillQuaternary : cssVar.colorBgContainer,
          borderRadius: cssVar.borderRadiusLG,
          boxShadow: '0 4px 8px -2px rgba(0,0,0,.02)',
          overflow: 'hidden',
        }}
      >
        <Text color={cssVar.colorTextSecondary} fontSize={13}>
          {preset.description || 'Описание тренажера'}
        </Text>
      </Block>
      <Flexbox horizontal align={'center'} gap={8} paddingBlock={8} paddingInline={12}>
        <Flexbox flex={1} gap={1} style={{ overflow: 'hidden' }}>
          <Text fontSize={13} weight={500}>
            {preset.title}
          </Text>
          <Text fontSize={12} type={'secondary'}>
            {loading ? 'Запуск...' : 'Нажмите, чтобы начать'}
          </Text>
        </Flexbox>
        <Avatar
          emojiScaleWithBackground
          avatar={preset.avatar || DEFAULT_AVATAR}
          background={preset.backgroundColor || undefined}
          shape={'square'}
          size={30}
          style={{ flex: 'none' }}
        />
      </Flexbox>
    </Block>
  );
});

export default TrainingAgentItem;
