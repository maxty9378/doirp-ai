'use client';

import { type ReactNode } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Loading from '@/components/Loading/BrandTextLoading';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Redirects non-admin users to home. Use around settings, resource, memory layouts.
 * Waits for user state to load before deciding (so username is available for admin check).
 */
export const AdminGuard = ({ children }: AdminGuardProps) => {
  const isAdmin = useIsAdmin();
  const isSignedIn = useUserStore(authSelectors.isLogin);
  const isUserStateInit = useUserStore((s) => s.isUserStateInit);
  const navigate = useNavigate();

  const canDecide = !isSignedIn || isUserStateInit;

  useEffect(() => {
    if (canDecide && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [canDecide, isAdmin, navigate]);

  if (!canDecide) return <Loading debugId="AdminGuard" />;
  if (!isAdmin) return null;

  return <>{children}</>;
};
