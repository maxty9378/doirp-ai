'use client';

import { Flexbox } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import SettingHeader from '@/app/[variants]/(main)/settings/features/SettingHeader';
import { useIsAdmin } from '@/hooks/useIsAdmin';

import { VoiceCallProxiesPanel } from './VoiceCallProxiesPanel';

const VoiceCallProxiesSettingsPage = () => {
  const { t } = useTranslation('setting');
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <>
      <SettingHeader title={t('tab.voiceCallProxies', { defaultValue: 'Прокси тренажёра' })} />
      <Flexbox gap={16} style={{ maxWidth: 1024 }}>
        {!isAdmin && !isDev ? (
          <div style={{ color: 'var(--colorTextSecondary)' }}>
            Раздел доступен только администраторам.{' '}
            <a href="/settings/profile" onClick={(e) => { e.preventDefault(); navigate('/settings/profile'); }}>
              В профиль
            </a>
          </div>
        ) : (
          <>
            {!isAdmin && isDev && (
              <div style={{ color: 'var(--colorTextSecondary)' }}>
                Dev-режим: доступ к прокси временно открыт всем пользователям, чтобы вы могли настроить и проверить
                доступность.
              </div>
            )}
            <VoiceCallProxiesPanel />
          </>
        )}
      </Flexbox>
    </>
  );
};

export default VoiceCallProxiesSettingsPage;
