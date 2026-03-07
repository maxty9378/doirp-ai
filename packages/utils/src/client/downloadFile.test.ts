import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadFile } from './downloadFile';

describe('downloadFile', () => {
  const mockFetch = vi.fn();
  const testBlob = new Blob(['image-bytes'], { type: 'image/jpeg' });

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(window, 'open').mockImplementation(() => null);

    window.history.replaceState({}, '', '/page');
  });

  it('should download cross-origin file through proxy', async () => {
    mockFetch.mockResolvedValueOnce(new Response(testBlob, { status: 200, statusText: 'OK' }));

    const url =
      'https://s3.twcstorage.ru/bucket/generations/images/test_raw.jpg?X-Amz-Signature=abc';
    await downloadFile(url, 'test.jpg', false);

    expect(mockFetch).toHaveBeenCalledWith('/webapi/proxy', { body: url, method: 'POST' });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download-url');
  });

  it('should download same-origin file directly with CORS options', async () => {
    mockFetch.mockResolvedValueOnce(new Response(testBlob, { status: 200, statusText: 'OK' }));

    const sameOriginUrl = '/f/file_abc123?raw=1';
    await downloadFile(sameOriginUrl, 'local.jpg', false);

    expect(mockFetch).toHaveBeenCalledWith(sameOriginUrl, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
    });
  });

  it('should open original url when fetch fails and fallback is enabled', async () => {
    const url = 'https://s3.twcstorage.ru/bucket/generations/images/failed.jpg';
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(downloadFile(url, 'failed.jpg', true)).resolves.toBeUndefined();
    expect(window.open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
  });

  it('should throw when fetch fails and fallback is disabled', async () => {
    const url = 'https://s3.twcstorage.ru/bucket/generations/images/failed.jpg';
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    await expect(downloadFile(url, 'failed.jpg', false)).rejects.toThrow('network error');
    expect(window.open).not.toHaveBeenCalled();
  });
});
