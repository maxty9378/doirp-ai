/**
 * Tests for /api/admin/voice-call/proxies admin CRUD.
 * Run:
 * bunx vitest run --silent='passed-only' 'src/app/(backend)/api/admin/voice-call/proxies/__tests__/route.test.ts'
 */
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: 'user_admin_001', email: 'admin@local.host', username: 'admin' },
      }),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockOrderBy = vi.fn().mockResolvedValue([
  {
    id: 'p1',
    url: 'http://user:pass@1.2.3.4:8080',
    enabled: 1,
    priority: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]);
const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    orderBy: mockOrderBy,
  }),
});

const mockReturningInsert = vi.fn().mockResolvedValue([
  {
    id: 'p2',
    url: 'socks5://127.0.0.1:2080',
    enabled: 1,
    priority: 1000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]);
const mockInsertValues = vi.fn().mockReturnValue({
  returning: mockReturningInsert,
});
const mockInsert = vi.fn().mockReturnValue({
  values: mockInsertValues,
});

const mockReturningUpdate = vi.fn().mockResolvedValue([
  {
    id: 'p1',
    url: 'http://user:pass@1.2.3.4:8080',
    enabled: 0,
    priority: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]);
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: mockReturningUpdate,
    }),
  }),
});

const mockReturningDelete = vi.fn().mockResolvedValue([
  {
    id: 'p1',
    url: 'http://user:pass@1.2.3.4:8080',
    enabled: 1,
    priority: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]);
const mockDelete = vi.fn().mockReturnValue({
  where: vi.fn().mockReturnValue({
    returning: mockReturningDelete,
  }),
});

vi.mock('@/database/server', () => ({
  serverDB: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

describe('/api/admin/voice-call/proxies', () => {
  it(
    'GET returns items and normalizes enabled to boolean',
    async () => {
      const { GET } = await import('../route');
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items[0].enabled).toBe(true);
    },
    15_000,
  );

  it('POST validates url', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/admin/voice-call/proxies', {
      method: 'POST',
      body: JSON.stringify({ url: 'not-a-url' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('POST creates item', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/admin/voice-call/proxies', {
      method: 'POST',
      body: JSON.stringify({ url: 'socks5://127.0.0.1:2080', enabled: true, priority: 1 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.url).toMatch(/socks5:\/\//);
    expect(json.item.enabled).toBe(true);
  });

  it('POST accepts HOST:PORT:USER:PASS format', async () => {
    mockInsertValues.mockClear();
    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/admin/voice-call/proxies', {
      method: 'POST',
      body: JSON.stringify({ url: '31.59.20.176:6754:xlvhmzvz:fdtx2d20nj7f', enabled: true, priority: 1000 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const inserted = mockInsertValues.mock.calls[0]?.[0] as { url?: string } | undefined;
    expect(inserted?.url).toBe('http://xlvhmzvz:fdtx2d20nj7f@31.59.20.176:6754');
  });
});

describe('/api/admin/voice-call/proxies/:id', () => {
  it('PATCH updates enabled', async () => {
    const { PATCH } = await import('../[id]/route');
    const req = new NextRequest('http://localhost/api/admin/voice-call/proxies/p1', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.item.enabled).toBe(false);
  });

  it('DELETE removes item', async () => {
    const { DELETE } = await import('../[id]/route');
    const req = new NextRequest('http://localhost/api/admin/voice-call/proxies/p1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

