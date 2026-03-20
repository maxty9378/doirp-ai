import { describe, expect, it } from 'vitest';

import { getLiveKitURL } from './getLiveKitURL';

describe('getLiveKitURL', () => {
  it('returns the original URL if no region is provided', () => {
    const url = 'https://myproject.livekit.cloud';

    expect(getLiveKitURL(url, null)).toBe(`${url}/`);
  });

  it('inserts the region into livekit.cloud URLs', () => {
    expect(getLiveKitURL('https://myproject.livekit.cloud', 'eu')).toBe(
      'https://myproject.eu.production.livekit.cloud/',
    );
  });

  it('preserves the staging environment when inserting the region', () => {
    expect(getLiveKitURL('https://myproject.staging.livekit.cloud', 'eu')).toBe(
      'https://myproject.eu.staging.livekit.cloud/',
    );
  });

  it('returns the original URL for non-livekit.cloud hosts', () => {
    const url = 'https://example.com';

    expect(getLiveKitURL(url, 'us')).toBe(`${url}/`);
  });

  it('preserves paths and query parameters', () => {
    expect(getLiveKitURL('https://myproject.livekit.cloud/room?foo=bar', 'ap')).toBe(
      'https://myproject.ap.production.livekit.cloud/room?foo=bar',
    );
  });
});
