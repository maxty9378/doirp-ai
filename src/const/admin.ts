/**
 * Username of the administrator. Only this user can access settings and create/manage agents.
 * Other users only see the list of agents created by the admin.
 */
export const ADMIN_USERNAME = 'maxim.kadochkin';

/**
 * Optional: admin by email (e.g. if username is not set in DB). Set NEXT_PUBLIC_ADMIN_EMAIL in .env.
 */
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';
