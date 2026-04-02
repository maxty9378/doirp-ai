import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

/**
 * Returns true if the current user is the administrator.
 */
export const useIsAdmin = (): boolean => {
  return useUserStore(authSelectors.isAdmin);
};
