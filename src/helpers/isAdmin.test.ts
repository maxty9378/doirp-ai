import { describe, expect, it } from 'vitest';

import { isAdminUser } from './isAdmin';

describe('isAdminUser', () => {
  it('returns true for admin role from database', () => {
    expect(isAdminUser({ role: 'admin' })).toBe(true);
  });

  it('returns true for explicit isAdmin flag', () => {
    expect(isAdminUser({ isAdmin: true })).toBe(true);
  });

  it('returns true for fallback admin username', () => {
    expect(isAdminUser({ username: 'admin' })).toBe(true);
  });

  it('returns false for regular user', () => {
    expect(isAdminUser({ email: 'user@example.com', role: 'user' })).toBe(false);
  });
});
