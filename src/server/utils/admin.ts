import { users } from '@lobechat/database/schemas';
import { asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';
import { type AdminUserLike, isAdminUser } from '@/helpers/isAdmin';

export interface SessionAdminUser extends AdminUserLike {
  id?: string;
}

export const getSessionUser = async (): Promise<SessionAdminUser | undefined> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user as SessionAdminUser | undefined;
};

export const getSessionAdminUser = async (): Promise<SessionAdminUser | null> => {
  const user = await getSessionUser();

  if (!user?.id) return null;
  if (isAdminUser(user)) return user;

  const dbUser = await serverDB
    .select({
      email: users.email,
      role: users.role,
      username: users.username,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const hydratedUser = {
    ...user,
    ...dbUser[0],
  };

  if (!isAdminUser(hydratedUser)) return null;

  return hydratedUser;
};

export const getPrimaryAdminId = async (): Promise<string | null> => {
  try {
    if (ADMIN_USERNAME) {
      const byUsername = await serverDB
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, ADMIN_USERNAME))
        .limit(1);

      if (byUsername[0]?.id) return byUsername[0].id;
    }

    if (ADMIN_EMAIL) {
      const byEmail = await serverDB
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, ADMIN_EMAIL.toLowerCase()))
        .limit(1);

      if (byEmail[0]?.id) return byEmail[0].id;
    }

    const byRole = await serverDB
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .orderBy(asc(users.createdAt))
      .limit(1);

    return byRole[0]?.id || null;
  } catch (error) {
    console.error('[admin] failed to resolve primary admin id:', error);
    return null;
  }
};
