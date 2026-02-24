/**
 * Username of the administrator. Only this user can access settings and create/manage agents.
 * Other users only see the list of agents created by the admin.
 */
export const ADMIN_USERNAME = 'maxim.kadochkin';

/**
 * Admin email. Set NEXT_PUBLIC_ADMIN_EMAIL in .env to override.
 */
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'maxim.kadochkin@gmail.com';
