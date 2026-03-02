'use client';

import { BRANDING_EMAIL, SOCIAL_URL } from '@lobechat/business-const';
import { useAnalytics } from '@lobehub/analytics/react';
import { type MenuProps } from '@lobehub/ui';
import { ActionIcon, DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import { createStaticStyles, keyframes } from 'antd-style';
import { DiscordIcon } from '@lobehub/ui/icons';
import {
  Book,
  CircleHelp,
  Feather,
  FileClockIcon,
  FlaskConical,
  Github,
  Mail,
  Rocket,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import ChangelogModal from '@/components/ChangelogModal';
import HighlightNotification from '@/components/HighlightNotification';
import LabsModal from '@/components/LabsModal';
import { DOCUMENTS_REFER_URL, GITHUB, mailTo } from '@/const/url';
import ThemeButton from '@/features/User/UserPanel/ThemeButton';
import ResourceWidget from '@/app/[variants]/(main)/home/features/ResourceWidget';
import { useFeedbackModal } from '@/hooks/useFeedbackModal';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors/systemStatus';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';
import { userGeneralSettingsSelectors } from '@/store/user/slices/settings/selectors';

const gradientShift = keyframes`
  0% { background-position: 0% 0%; }
  25% { background-position: 100% 50%; }
  50% { background-position: 50% 100%; }
  75% { background-position: 0% 50%; }
  100% { background-position: 0% 0%; }
`;

const styles = createStaticStyles(({ css, cssVar }) => ({
  tokenContainer: css`
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    padding: 12px;
    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    background: linear-gradient(
      135deg,
      ${cssVar.colorBgContainer} 0%,
      rgba(99, 102, 241, 0.15) 8%,
      rgba(124, 58, 237, 0.18) 16%,
      rgba(139, 92, 246, 0.16) 24%,
      rgba(192, 132, 252, 0.14) 32%,
      rgba(236, 72, 153, 0.12) 40%,
      rgba(59, 130, 246, 0.15) 48%,
      rgba(6, 182, 212, 0.18) 56%,
      rgba(20, 184, 166, 0.14) 64%,
      rgba(34, 211, 238, 0.12) 72%,
      rgba(99, 102, 241, 0.16) 80%,
      rgba(139, 92, 246, 0.14) 88%,
      ${cssVar.colorBgContainer} 100%
    );
    background-size: 300% 300%;
    animation: ${gradientShift} 10s ease-in-out infinite;
  `,
}));

const PRODUCT_HUNT_NOTIFICATION = {
  actionHref: 'https://www.producthunt.com/products/lobehub?launch=lobehub',
  endTime: new Date('2026-02-01T00:00:00Z'),
  image: 'https://hub-apac-1.lobeobjects.space/og/lobehub-ph.png',
  slug: 'product-hunt-2026',
  startTime: new Date('2026-01-27T08:00:00Z'),
};

const Footer = memo(() => {
  const { t } = useTranslation('common');
  const { analytics } = useAnalytics();
  const { hideGitHub } = useServerConfigStore(featureFlagsSelectors);
  const isLogin = useUserStore(authSelectors.isLogin);
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
  const [isLabsModalOpen, setIsLabsModalOpen] = useState(false);
  const [shouldLoadChangelog, setShouldLoadChangelog] = useState(false);
  const [isChangelogModalOpen, setIsChangelogModalOpen] = useState(false);
  const [isProductHuntCardOpen, setIsProductHuntCardOpen] = useState(false);

  const [isNotificationRead, updateSystemStatus] = useGlobalStore((s) => [
    systemStatusSelectors.isNotificationRead(PRODUCT_HUNT_NOTIFICATION.slug)(s),
    s.updateSystemStatus,
  ]);

  const isWithinTimeWindow = useMemo(() => {
    const now = new Date();
    return now >= PRODUCT_HUNT_NOTIFICATION.startTime && now <= PRODUCT_HUNT_NOTIFICATION.endTime;
  }, []);

  const trackProductHuntEvent = useCallback(
    (eventName: string, properties: Record<string, string>) => {
      try {
        analytics?.track({ name: eventName, properties });
      } catch {
        // silently ignore tracking errors to avoid affecting business logic
      }
    },
    [analytics],
  );

  useEffect(() => {
    if (isWithinTimeWindow && !isNotificationRead) {
      setIsProductHuntCardOpen(true);
      trackProductHuntEvent('product_hunt_card_viewed', {
        spm: 'homepage.product_hunt.viewed',
        trigger: 'auto',
      });
    }
  }, [isWithinTimeWindow, isNotificationRead, trackProductHuntEvent]);

  const { open: openFeedbackModal } = useFeedbackModal();

  const handleOpenLabsModal = () => {
    setIsLabsModalOpen(true);
  };

  const handleCloseLabsModal = () => {
    setIsLabsModalOpen(false);
  };

  const handleOpenChangelogModal = () => {
    setShouldLoadChangelog(true);
    setIsChangelogModalOpen(true);
  };

  const handleCloseChangelogModal = () => {
    setIsChangelogModalOpen(false);
  };

  const handleOpenFeedbackModal = () => {
    openFeedbackModal();
  };

  const handleOpenProductHuntCard = () => {
    setIsProductHuntCardOpen(true);
    trackProductHuntEvent('product_hunt_card_viewed', {
      spm: 'homepage.product_hunt.viewed',
      trigger: 'menu_click',
    });
  };

  const handleCloseProductHuntCard = () => {
    setIsProductHuntCardOpen(false);
    if (!isNotificationRead) {
      const currentSlugs = useGlobalStore.getState().status.readNotificationSlugs || [];
      updateSystemStatus({
        readNotificationSlugs: [...currentSlugs, PRODUCT_HUNT_NOTIFICATION.slug],
      });
    }
    trackProductHuntEvent('product_hunt_card_closed', {
      spm: 'homepage.product_hunt.closed',
    });
  };

  const handleProductHuntActionClick = () => {
    trackProductHuntEvent('product_hunt_action_clicked', {
      spm: 'homepage.product_hunt.action_clicked',
    });
  };

  const helpMenuItems: MenuProps['items'] = useMemo(
    () => [
      {
        icon: <Icon icon={Book} />,
        key: 'docs',
        label: (
          <a href={DOCUMENTS_REFER_URL} rel="noopener noreferrer" target="_blank">
            {t('userPanel.docs')}
          </a>
        ),
      },
      {
        icon: <Icon icon={Feather} />,
        key: 'feedback',
        label: t('userPanel.feedback'),
        onClick: handleOpenFeedbackModal,
      },
      {
        icon: <Icon icon={DiscordIcon} />,
        key: 'discord',
        label: (
          <a href={SOCIAL_URL.discord} rel="noopener noreferrer" target="_blank">
            {t('userPanel.discord')}
          </a>
        ),
      },
      {
        icon: <Icon icon={Mail} />,
        key: 'email',
        label: (
          <a href={mailTo(BRANDING_EMAIL.support)} rel="noopener noreferrer" target="_blank">
            {t('userPanel.email')}
          </a>
        ),
      },
      {
        type: 'divider',
      },
      {
        icon: <Icon icon={FileClockIcon} />,
        key: 'changelog',
        label: t('changelog'),
        onClick: handleOpenChangelogModal,
      },
      {
        icon: <Icon icon={FlaskConical} />,
        key: 'labs',
        label: t('labs'),
        onClick: handleOpenLabsModal,
      },
      ...(isWithinTimeWindow
        ? [
            {
              icon: <Icon icon={Rocket} />,
              key: 'productHunt',
              label: 'Product Hunt',
              onClick: handleOpenProductHuntCard,
            },
          ]
        : []),
    ],
    [t, isWithinTimeWindow],
  );

  return (
    <>
      {isLogin && (
        <Flexbox gap={8} style={{ padding: '0 8px 8px' }}>
          <div className={styles.tokenContainer}>
            <ResourceWidget />
          </div>
        </Flexbox>
      )}
      <Flexbox horizontal align={'center'} gap={2} justify={'space-between'} padding={8}>
        <Flexbox horizontal align={'center'} flex={1} gap={2}>
          <DropdownMenu items={helpMenuItems} placement="topLeft">
            <ActionIcon aria-label={t('userPanel.help')} icon={CircleHelp} size={16} />
          </DropdownMenu>
          {!hideGitHub && (
            <a aria-label={'GitHub'} href={GITHUB} rel="noopener noreferrer" target={'_blank'}>
              <ActionIcon icon={Github} size={16} title={'GitHub'} />
            </a>
          )}
          {isDevMode && (
            <Link to="/eval">
              <ActionIcon icon={FlaskConical} size={16} title="Evaluation Lab" />
            </Link>
          )}
        </Flexbox>
        <ThemeButton placement={'topCenter'} size={16} />
      </Flexbox>
      <LabsModal open={isLabsModalOpen} onClose={handleCloseLabsModal} />
      <ChangelogModal
        open={isChangelogModalOpen}
        shouldLoad={shouldLoadChangelog}
        onClose={handleCloseChangelogModal}
      />
      <HighlightNotification
        actionHref={PRODUCT_HUNT_NOTIFICATION.actionHref}
        actionLabel={t('productHunt.actionLabel')}
        description={t('productHunt.description')}
        image={PRODUCT_HUNT_NOTIFICATION.image}
        open={isProductHuntCardOpen}
        title={t('productHunt.title')}
        onActionClick={handleProductHuntActionClick}
        onClose={handleCloseProductHuntCard}
      />
    </>
  );
});

export default Footer;
