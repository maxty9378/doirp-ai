'use client';

import { useAnalytics } from '@lobehub/analytics/react';
import { Flexbox } from '@lobehub/ui';
import { createStaticStyles, keyframes } from 'antd-style';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ResourceWidget from '@/app/[variants]/(main)/home/features/ResourceWidget';
import HighlightNotification from '@/components/HighlightNotification';
import ThemeButton from '@/features/User/UserPanel/ThemeButton';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors/systemStatus';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

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

    overflow: hidden;

    width: 100%;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: linear-gradient(
      135deg,
      ${cssVar.colorBgContainer} 0%,
      rgb(99 102 241 / 15%) 8%,
      rgb(124 58 237 / 18%) 16%,
      rgb(139 92 246 / 16%) 24%,
      rgb(192 132 252 / 14%) 32%,
      rgb(236 72 153 / 12%) 40%,
      rgb(59 130 246 / 15%) 48%,
      rgb(6 182 212 / 18%) 56%,
      rgb(20 184 166 / 14%) 64%,
      rgb(34 211 238 / 12%) 72%,
      rgb(99 102 241 / 16%) 80%,
      rgb(139 92 246 / 14%) 88%,
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
  const isLogin = useUserStore(authSelectors.isLogin);
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

  return (
    <>
      {isLogin && (
        <Flexbox gap={8} style={{ padding: '0 8px 8px' }}>
          <div className={styles.tokenContainer}>
            <ResourceWidget />
          </div>
          <Flexbox horizontal justify="flex-end" style={{ width: '100%' }}>
            <ThemeButton placement="topRight" size={18} />
          </Flexbox>
        </Flexbox>
      )}
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
