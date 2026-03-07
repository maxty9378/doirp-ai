import { type ItemType } from '@lobehub/ui';
import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import ToolsList from './ToolsList';

interface PopoverContentProps {
  items: ItemType[];
}

const PopoverContent = memo<PopoverContentProps>(({ items }) => {
  return (
    <Flexbox gap={0}>
      <div
        style={{
          maxHeight: 500,
          overflowY: 'auto',
        }}
      >
        <ToolsList items={items} />
      </div>
    </Flexbox>
  );
});

PopoverContent.displayName = 'PopoverContent';

export default PopoverContent;
