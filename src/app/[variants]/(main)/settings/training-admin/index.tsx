'use client';

import { memo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Настройки тренажёров перенесены на страницу /training.
 * Редирект для старых закладок.
 */
const TrainingAdminRedirect = memo(() => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/training', { replace: true });
  }, [navigate]);
  return null;
});

TrainingAdminRedirect.displayName = 'TrainingAdminRedirect';

export default TrainingAdminRedirect;
