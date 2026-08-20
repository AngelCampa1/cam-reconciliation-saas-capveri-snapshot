/**
 * Tests for sitemap generator script
 * TDD: Write tests FIRST
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  SitemapConfig,
  SitemapEntry,
  generateSitemapXml,
  getStaticPages,
  getResourcePages,
  buildSitemap,
} from './generate-sitemap'

describe('Sitemap Generator', () => {
  describe('getStaticPages', () => {
    it('returns array of static page entries', () => {
      const pages = getStaticPages()

      expect(Array.isArray(pages)).toBe(true)
      expect(pages.length).toBeGreaterThan(0)
    })

    it('includes homepage with highest priority', () => {
      const pages = getStaticPages()
      const homepage = pages.find((p) => p.loc === 'https://capveri.com/')

      expect(homepage).toBeDefined()
      expect(homepage?.priority).toBe(1.0)
    })

    it('includes pricing page', () => {
      const pages = getStaticPages()
      const pricing = pages.find((p) => p.loc.includes('/pricing'))

      expect(pricing).toBeDefined()
      expect(pricing?.priority).toBeGreaterThanOrEqual(0.8)
    })

    it('includes legal pages with low priority', () => {
      const pages = getStaticPages()
      const privacy = pages.find((p) => p.loc.includes('/privacy'))
      const terms = pages.find((p) => p.loc.includes('/terms'))

      expect(privacy).toBeDefined()
      expect(terms).toBeDefined()
      expect(privacy?.priority).toBeLessThanOrEqual(0.4)
      expect(terms?.priority).toBeLessThanOrEqual(0.4)
    })

    it('all entries have required fields', () => {
      const pages = getStaticPages()

      pages.forEach((page) => {
        expect(page.loc).toBeDefined()
        expect(page.loc).toMatch(/^https:\/\//)
        expect(page.changefreq).toBeDefined()
        expect(page.priority).toBeGreaterThanOrEqual(0)
        expect(page.priority).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('getResourcePages', () => {
    it('returns array of resource page entries', () => {
      const pages = getResourcePages()

      expect(Array.isArray(pages)).toBe(true)
    })

    it('includes CAM-specific resource pages', () => {
      const pages = getResourcePages()
      const camPages = pages.filter(
        (p) =>
          p.loc.includes('/resources/') ||
          p.loc.includes('/guides/') ||
          p.loc.includes('/faq')
      )

      expect(camPages.length).toBeGreaterThan(0)
    })

    it('resource pages have medium priority', () => {
      const pages = getResourcePages()

      pages.forEach((page) => {
        expect(page.priority).toBeGreaterThanOrEqual(0.5)
        expect(page.priority).toBeLessThanOrEqual(0.8)
      })
    })
  })

  describe('generateSitemapXml', () => {
    it('generates valid XML structure', () => {
      const entries: SitemapEntry[] = [
        {
          loc: 'https://capveri.com/',
          changefreq: 'weekly',
          priority: 1.0,
        },
      ]

      const xml = generateSitemapXml(entries)

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(xml).toContain('</urlset>')
    })

    it('includes all entry fields', () => {
      const entries: SitemapEntry[] = [
        {
          loc: 'https://capveri.com/pricing',
          changefreq: 'weekly',
          priority: 0.9,
          lastmod: '2024-01-15',
        },
      ]

      const xml = generateSitemapXml(entries)

      expect(xml).toContain('<loc>https://capveri.com/pricing</loc>')
      expect(xml).toContain('<changefreq>weekly</changefreq>')
      expect(xml).toContain('<priority>0.9</priority>')
      expect(xml).toContain('<lastmod>2024-01-15</lastmod>')
    })

    it('handles multiple entries', () => {
      const entries: SitemapEntry[] = [
        { loc: 'https://capveri.com/', changefreq: 'weekly', priority: 1.0 },
        { loc: 'https://capveri.com/pricing', changefreq: 'weekly', priority: 0.9 },
        { loc: 'https://capveri.com/about', changefreq: 'monthly', priority: 0.7 },
      ]

      const xml = generateSitemapXml(entries)
      const urlCount = (xml.match(/<url>/g) || []).length

      expect(urlCount).toBe(3)
    })

    it('omits lastmod if not provided', () => {
      const entries: SitemapEntry[] = [
        { loc: 'https://capveri.com/', changefreq: 'weekly', priority: 1.0 },
      ]

      const xml = generateSitemapXml(entries)

      expect(xml).not.toContain('<lastmod>')
    })

    it('escapes special XML characters in URLs', () => {
      const entries: SitemapEntry[] = [
        {
          loc: 'https://capveri.com/search?q=test&page=1',
          changefreq: 'weekly',
          priority: 0.5,
        },
      ]

      const xml = generateSitemapXml(entries)

      expect(xml).toContain('&amp;')
      expect(xml).not.toContain('&page')
    })
  })

  describe('buildSitemap', () => {
    const testOutputPath = path.join(__dirname, '../public/sitemap-test.xml')

    afterEach(() => {
      // Clean up test file
      if (fs.existsSync(testOutputPath)) {
        fs.unlinkSync(testOutputPath)
      }
    })

    it('combines static and resource pages', () => {
      const config: SitemapConfig = {
        baseUrl: 'https://capveri.com',
        outputPath: testOutputPath,
      }

      const result = buildSitemap(config)

      expect(result.totalUrls).toBeGreaterThan(0)
      expect(result.success).toBe(true)
    })

    it('writes sitemap file to specified path', () => {
      const config: SitemapConfig = {
        baseUrl: 'https://capveri.com',
        outputPath: testOutputPath,
      }

      buildSitemap(config)

      expect(fs.existsSync(testOutputPath)).toBe(true)
    })

    it('returns count of generated URLs', () => {
      const config: SitemapConfig = {
        baseUrl: 'https://capveri.com',
        outputPath: testOutputPath,
      }

      const result = buildSitemap(config)

      expect(result.totalUrls).toBeGreaterThan(5)
    })
  })
})
