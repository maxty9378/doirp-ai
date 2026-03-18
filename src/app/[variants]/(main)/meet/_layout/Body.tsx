'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { VideoIcon } from 'lucide-react';
import { memo } from 'react';

import NavItem from '@/features/NavPanel/components/NavItem';

const Body = memo(() => {
  return (
    <Flexbox gap={1} paddingBlock={8} paddingInline={8}>
      <NavItem
        active
        icon={VideoIcon}
        title={
          <Flexbox gap={2}>
            <Text style={{ fontSize: 13, fontWeight: 500 }}>
              Активная комната
            </Text>
          </Flexbox>
        }
      />
      <Flexbox paddingBlock={12}>
        <Text style={{ fontSize: 12, color: 'var(--colorTextQuaternary)', textAlign: 'center' }}>
          Список недавних звонков пуст
        </Text>
      </Flexbox>
    </Flexbox>
  );
});

Body.displayName = 'MeetSidebarBody';

export default Body;
