import { type NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { createRouteMatcher } from './createRouteMatcher';
import { PUBLIC_ROUTE_PATTERNS } from './publicRoutes';

const createMockRequest = (pathname: string): NextRequest =>
  ({
    nextUrl: { pathname },
  }) as NextRequest;

describe('PUBLIC_ROUTE_PATTERNS', () => {
  const matcher = createRouteMatcher([...PUBLIC_ROUTE_PATTERNS]);

  it('keeps proxy credential endpoints public for server-to-server access', () => {
    expect(matcher(createMockRequest('/api/voice-call/proxy-key'))).toBe(true);
    expect(matcher(createMockRequest('/api/voice-call/proxy-key/'))).toBe(true);
    expect(matcher(createMockRequest('/api/voice-call/proxy-auth-token'))).toBe(true);
    expect(matcher(createMockRequest('/api/voice-call/proxy-auth-token/'))).toBe(true);
  });

  it('does not make the whole voice-call API public', () => {
    expect(matcher(createMockRequest('/api/voice-call/config'))).toBe(false);
  });
});
