import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';

/**
 * Returns true if the current user is the administrator (by username or by ADMIN_EMAIL).
 * Non-admin users should only see the agent list; admin can configure everything.
 */
export const useIsAdmin = (): boolean => {
  const username = useUserStore(userProfileSelectors.username);
  const email = useUserStore(userProfileSelectors.email);
  if (username === ADMIN_USERNAME) return true;
  if (ADMIN_EMAIL && email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return true;
  return false;
};
