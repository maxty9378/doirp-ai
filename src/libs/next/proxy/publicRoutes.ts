export const PUBLIC_ROUTE_PATTERNS = [
  // backend api
  '/api/auth(.*)',
  '/api/webhooks(.*)',
  '/api/workflows(.*)',
  '/api/agent(.*)',
  '/api/dev(.*)',
  '/api/voice-call/proxy-key(.*)',
  '/api/voice-call/proxy-auth-token(.*)',
  '/webapi(.*)',
  '/trpc(.*)',
  // version
  '/api/version',
  '/api/desktop/(.*)',
  // better auth
  '/signin',
  '/signup',
  '/auth-error',
  '/verify-email',
  '/reset-password',
  // oauth
  // Make only the consent view public (GET page), not other oauth paths
  '/oauth/consent/(.*)',
  '/oidc/handoff',
  '/oidc/token',
  // market
  '/market-auth-callback',
  // public share pages
  '/share(.*)',
] as const;
