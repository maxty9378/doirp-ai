/**
 * Tests for POST /api/admin/users — create user (admin only).
 * Run: bunx vitest run --silent='passed-only' 'src/app/(backend)/api/admin/users/__tests__/route.test.ts'
 */
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

// Mock auth: admin session
vi.mock('@/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: 'user_admin_001', email: 'admin@local.host', username: 'admin' },
      }),
    },
  },
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock server DB: no existing user, inserts succeed
const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockQueryUsersFindFirst = vi.fn().mockResolvedValue(undefined);

vi.mock('@/database/server', () => ({
  serverDB: {
    insert: mockInsert,
    query: {
      users: {
        findFirst: mockQueryUsersFindFirst,
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
    execute: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock ensureUserCodesSchema (schema already exists)
vi.mock('@/server/services/admin/ensureUserCodesSchema', () => ({
  ensureUserCodesSchema: vi.fn().mockResolvedValue(undefined),
}));

// Mock UserService so we don't load analytics (server env)
vi.mock('@/server/services/user', () => ({
  UserService: {
    initUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock better-auth hashPassword
vi.mock('better-auth/crypto', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password_stub'),
}));

describe('POST /api/admin/users', () => {
  it(
    'returns 400 when email is missing',
    async () => {
      const { POST } = await import('../route');
      const req = new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/email/i);
    },
    15_000,
  );

  it('returns 400 when email is empty string', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: '   ' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with code, email, tokenQuota when user is created', async () => {
    mockQueryUsersFindFirst.mockResolvedValueOnce(undefined);

    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'testuser@example.com', tokenQuota: 50000 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.email).toBe('testuser@example.com');
    expect(json.tokenQuota).toBe(50000);
    expect(typeof json.code).toBe('string');
    expect(json.code.length).toBeGreaterThan(0);
  });

  it('returns 400 when email already registered', async () => {
    mockQueryUsersFindFirst.mockResolvedValueOnce({
      id: 'user_existing',
      email: 'existing@example.com',
    } as any);

    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'existing@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/already registered/i);
  });
});
