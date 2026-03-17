// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { PluginStore } from './index';

const baseURL = 'https://registry.npmmirror.com/@lobehub/plugins-index/v1/files/public';

describe('PluginStore', () => {
  it('should return the default index URL when no language is provided', () => {
    const pluginStore = new PluginStore();
    const url = pluginStore.getPluginIndexUrl();
    expect(url).toBe(`${baseURL}/index.ru-RU.json`);
  });

  it('should return the index URL for a supported language', () => {
    const pluginStore = new PluginStore();
    const url = pluginStore.getPluginIndexUrl('ru-RU');
    expect(url).toBe(`${baseURL}/index.ru-RU.json`);
  });

  it('should return the base URL if the provided language is not supported', () => {
    const pluginStore = new PluginStore();
    const url = pluginStore.getPluginIndexUrl('ru-RU');
    expect(url).toBe(`${baseURL}/index.ru-RU.json`);
  });
});
