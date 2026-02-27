/**
 * Username of the administrator. Only this user can access settings and create/manage agents.
 * Other users only see the list of agents created by the admin.
 * Seeded admin: username "admin" (see scripts/seed-admin.ts).
 */
export const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin';

/**
 * Admin email. Set NEXT_PUBLIC_ADMIN_EMAIL in .env to override.
 * Seeded admin: admin@local.host (see scripts/seed-admin.ts).
 */
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@local.host';
