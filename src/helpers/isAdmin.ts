import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';

export interface AdminUserLike {
  email?: string | null;
  isAdmin?: boolean | null;
  role?: string | null;
  username?: string | null;
}

export const isAdminUser = (user?: AdminUserLike | null): boolean => {
  if (!user) return false;

  if (user.role === 'admin' || user.isAdmin === true) return true;

  const username = typeof user.username === 'string' ? user.username.trim() : '';
  if (username && username === ADMIN_USERNAME) return true;

  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (ADMIN_EMAIL && email && email === ADMIN_EMAIL.toLowerCase()) return true;

  return false;
};
