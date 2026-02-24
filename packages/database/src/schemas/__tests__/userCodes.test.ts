import { describe, expect, it } from 'vitest';

import { DEFAULT_USER_TOKEN_QUOTA, userCodes } from '../user';

describe('userCodes schema', () => {
  it('DEFAULT_USER_TOKEN_QUOTA is 100_000', () => {
    expect(DEFAULT_USER_TOKEN_QUOTA).toBe(100_000);
  });

  it('userCodes has tokenQuota and tokensUsed columns with correct defaults', () => {
    const tokenQuotaCol = userCodes.tokenQuota;
    const tokensUsedCol = userCodes.tokensUsed;
    expect(tokenQuotaCol).toBeDefined();
    expect(tokensUsedCol).toBeDefined();
    expect(tokenQuotaCol.default).toBeDefined();
    expect(tokensUsedCol.default).toBeDefined();
  });
});
