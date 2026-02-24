import { ModelIcon } from '@lobehub/icons';
import { Center } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import { useActionBarContext } from '../context';

const styles = createStaticStyles(({ css }) => ({
  icon: css`
    pointer-events: none;
  `,
  model: css`
    border-radius: 24px;
  `,
}));

/** Кнопка переключения моделей скрыта: в интерфейсе только одна модель (Gemini 1.5 Pro). */
const ModelSwitch = memo(() => {
  const { borderRadius } = useActionBarContext();
  const agentId = useAgentId();
  const [model] = useAgentStore((s) => [
    agentByIdSelectors.getAgentModelById(agentId)(s),
  ]);

  return (
    <Center
      className={styles.model}
      height={36}
      style={borderRadius ? { borderRadius } : undefined}
      width={36}
    >
      <div className={styles.icon}>
        <ModelIcon model={model} size={22} />
      </div>
    </Center>
  );
});

ModelSwitch.displayName = 'ModelSwitch';

export default ModelSwitch;
