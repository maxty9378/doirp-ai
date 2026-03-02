// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { getCanonicalUrl } from '@/server/utils/url';

import { LAST_MODIFIED, Sitemap, SitemapType } from './sitemap';

describe('Sitemap', () => {
  const sitemap = new Sitemap();

  describe('getIndex', () => {
    it('should return a valid sitemap index (static pages only, no market)', async () => {
      const index = await sitemap.getIndex();
      expect(index).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(index).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

      // Check static sitemaps only (no plugins/assistants/models from market)
      [SitemapType.Pages, SitemapType.Providers].forEach((type) => {
        expect(index).toContain(`<loc>${getCanonicalUrl(`/sitemap/${type}.xml`)}</loc>`);
      });

      expect(index).not.toContain('/sitemap/plugins-');
      expect(index).not.toContain('/sitemap/assistants-');
      expect(index).not.toContain('/sitemap/models-');
      expect(index).toContain(`<lastmod>${LAST_MODIFIED}</lastmod>`);
    });
  });

  describe('getPage', () => {
    it('should return a valid page sitemap', async () => {
      const pageSitemap = await sitemap.getPage();
      expect(pageSitemap).toContainEqual(
        expect.objectContaining({
          url: getCanonicalUrl('/'),
          changeFrequency: 'monthly',
          priority: 0.4,
        }),
      );
      // /discover has been replaced with /community routes
      expect(pageSitemap).toContainEqual(
        expect.objectContaining({
          url: getCanonicalUrl('/community'),
          changeFrequency: 'daily',
          priority: 0.7,
        }),
      );
      expect(pageSitemap).toContainEqual(
        expect.objectContaining({
          url: getCanonicalUrl('/community/agent'),
          changeFrequency: 'daily',
          priority: 0.7,
        }),
      );
      expect(pageSitemap).toContainEqual(
        expect.objectContaining({
          url: getCanonicalUrl('/community/plugin'),
          changeFrequency: 'daily',
          priority: 0.7,
        }),
      );
    });
  });

  describe('getAssistants', () => {
    it('should return empty array (no market)', async () => {
      const assistantsSitemap = await sitemap.getAssistants();
      expect(assistantsSitemap).toEqual([]);
    });

    it('should return empty array with page param (no market)', async () => {
      const firstPageSitemap = await sitemap.getAssistants(1);
      const secondPageSitemap = await sitemap.getAssistants(2);
      expect(firstPageSitemap).toEqual([]);
      expect(secondPageSitemap).toEqual([]);
    });
  });

  describe('getPlugins', () => {
    it('should return empty array (no market)', async () => {
      const pluginsSitemap = await sitemap.getPlugins();
      expect(pluginsSitemap).toEqual([]);
    });

    it('should return empty array with page param (no market)', async () => {
      const firstPageSitemap = await sitemap.getPlugins(1);
      const thirdPageSitemap = await sitemap.getPlugins(3);
      expect(firstPageSitemap).toEqual([]);
      expect(thirdPageSitemap).toEqual([]);
    });
  });

  describe('getModels', () => {
    it('should return empty array (no market)', async () => {
      const modelsSitemap = await sitemap.getModels();
      expect(modelsSitemap).toEqual([]);
    });

    it('should return empty array with page param (no market)', async () => {
      const firstPageSitemap = await sitemap.getModels(1);
      const secondPageSitemap = await sitemap.getModels(2);
      expect(firstPageSitemap).toEqual([]);
      expect(secondPageSitemap).toEqual([]);
    });
  });

  describe('getProviders', () => {
    it('should return empty array (no market)', async () => {
      const providersSitemap = await sitemap.getProviders();
      expect(providersSitemap).toEqual([]);
    });
  });

  describe('page count methods', () => {
    it('should return 0 for all page counts (no market)', async () => {
      expect(await sitemap.getPluginPageCount()).toBe(0);
      expect(await sitemap.getAssistantPageCount()).toBe(0);
      expect(await sitemap.getModelPageCount()).toBe(0);
    });
  });

  describe('getRobots', () => {
    it('should return correct robots.txt entries', () => {
      const robots = sitemap.getRobots();
      expect(robots).toContain(getCanonicalUrl('/sitemap-index.xml'));
      [SitemapType.Pages, SitemapType.Providers].forEach((type) => {
        expect(robots).toContain(getCanonicalUrl(`/sitemap/${type}.xml`));
      });
    });
  });
});
