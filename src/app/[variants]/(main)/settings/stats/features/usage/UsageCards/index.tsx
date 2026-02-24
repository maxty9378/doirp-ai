import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import { type UsageChartProps } from '../../../types';
import ActiveModels from './ActiveModels';
import MonthSpend from './MonthSpend';
import RemainingLimit from './RemainingLimit';
import TodaySpend from './TodaySpend';

const UsageCards = memo<UsageChartProps>(({ isLoading, data, groupBy }) => {
  return (
    <Flexbox horizontal gap={16} wrap="wrap">
      <TodaySpend data={data} isLoading={isLoading} />
      <MonthSpend data={data} isLoading={isLoading} />
      <RemainingLimit />
      <ActiveModels data={data} groupBy={groupBy} isLoading={isLoading} />
    </Flexbox>
  );
});

export default UsageCards;
