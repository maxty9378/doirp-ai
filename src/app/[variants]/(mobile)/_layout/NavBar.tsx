'use client';

import { Icon } from '@lobehub/ui';
import { type TabBarProps } from '@lobehub/ui/mobile';
import { TabBar } from '@lobehub/ui/mobile';
import { createStaticStyles } from 'antd-style';
import { Bot, MessageSquare, User } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { MOBILE_TABBAR_HEIGHT } from '@/const/layoutTokens';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import { SidebarTabKey } from '@/store/global/initialState';

const styles = createStaticStyles(({ css, cssVar }) => ({
  active: css`
    svg {
      fill: color-mix(in srgb, ${cssVar.colorPrimary} 33%, transparent);
    }
  `,
  container: css`
    position: fixed;
    z-index: 100;
    inset-block-end: 0;
    inset-inline: 0;
  `,
}));

const NavBar = memo(() => {
  const { t } = useTranslation('common');
  const activeKey = useActiveTabKey();
  const navigate = useNavigate();

  const items: TabBarProps['items'] = useMemo(
    () => [
      {
        icon: (active: boolean) => (
          <Icon className={active ? styles.active : undefined} icon={MessageSquare} />
        ),
        key: SidebarTabKey.Chat,
        onClick: () => {
          navigate('/agent');
        },
        title: t('tab.chat'),
      },
      {
        icon: (active: boolean) => <Icon className={active ? styles.active : undefined} icon={Bot} />,
        key: 'training',
        onClick: () => {
          navigate('/training');
        },
        title: 'Тренажёры',
      },
      {
        icon: (active: boolean) => (
          <Icon className={active ? styles.active : undefined} icon={User} />
        ),
        key: SidebarTabKey.Me,
        onClick: () => {
          navigate('/me');
        },
        title: t('tab.me'),
      },
    ],
    [navigate, t],
  );

  return (
    <TabBar
      activeKey={activeKey}
      className={styles.container}
      height={MOBILE_TABBAR_HEIGHT}
      items={items}
    />
  );
});

NavBar.displayName = 'NavBar';

export default NavBar;
