/**
 * Sitemap Generator for CapVeri
 * Generates a static sitemap.xml at build time for SEO optimization
 *
 * Usage:
 *   npx tsx scripts/generate-sitemap.ts
 *   npm run generate-sitemap (after adding to package.json)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// ============================================================================
// Types
// ============================================================================

export interface SitemapEntry {
  loc: string
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: number
  lastmod?: string
}

export interface SitemapConfig {
  baseUrl: string
  outputPath: string
}

export interface SitemapResult {
  success: boolean
  totalUrls: number
  outputPath: string
}

// ============================================================================
// Constants
// ============================================================================

const BASE_URL = 'https://capveri.com'
const DEFAULT_OUTPUT = 'public/sitemap.xml'

// ============================================================================
// Static Pages
// ============================================================================

export function getStaticPages(): SitemapEntry[] {
  const today = new Date().toISOString().split('T')[0]

  return [
    // Homepage - Highest Priority
    {
      loc: `${BASE_URL}/`,
      changefreq: 'weekly',
      priority: 1.0,
      lastmod: today,
    },

    // Pricing - High Priority (conversion page)
    {
      loc: `${BASE_URL}/pricing`,
      changefreq: 'weekly',
      priority: 0.9,
      lastmod: today,
    },

    // Company Pages
    {
      loc: `${BASE_URL}/about`,
      changefreq: 'monthly',
      priority: 0.7,
    },
    {
      loc: `${BASE_URL}/contact`,
      changefreq: 'monthly',
      priority: 0.7,
    },

    // Resource Pages
    {
      loc: `${BASE_URL}/docs`,
      changefreq: 'weekly',
      priority: 0.6,
    },
    {
      loc: `${BASE_URL}/help`,
      changefreq: 'weekly',
      priority: 0.6,
    },

    // Legal Pages - Low Priority
    {
      loc: `${BASE_URL}/privacy`,
      changefreq: 'yearly',
      priority: 0.3,
    },
    {
      loc: `${BASE_URL}/terms`,
      changefreq: 'yearly',
      priority: 0.3,
    },
    {
      loc: `${BASE_URL}/cookies`,
      changefreq: 'yearly',
      priority: 0.3,
    },
  ]
}

// ============================================================================
// Resource Pages (GEO-optimized content)
// ============================================================================

export function getResourcePages(): SitemapEntry[] {
  const today = new Date().toISOString().split('T')[0]

  // CAM-specific educational content pages for GEO optimization
  const resourceSlugs = [
    'what-is-cam-reconciliation',
    'how-to-audit-cam-charges',
    'boma-2024-cam-guidelines',
    'common-cam-billing-errors',
    'cam-audit-checklist',
    'understanding-operating-expenses',
    'cam-cap-provisions-explained',
    'gross-up-calculations',
  ]

  const resourcePages: SitemapEntry[] = [
    // Main resources hub
    {
      loc: `${BASE_URL}/resources`,
      changefreq: 'weekly',
      priority: 0.8,
      lastmod: today,
    },
    // FAQ page (GEO-important)
    {
      loc: `${BASE_URL}/faq`,
      changefreq: 'weekly',
      priority: 0.8,
      lastmod: today,
    },
    // Individual resource pages
    ...resourceSlugs.map((slug) => ({
      loc: `${BASE_URL}/resources/${slug}`,
      changefreq: 'monthly' as const,
      priority: 0.7,
    })),
  ]

  return resourcePages
}

// ============================================================================
// XML Generation
// ============================================================================

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Generate sitemap XML from entries
 */
export function generateSitemapXml(entries: SitemapEntry[]): string {
  const urlEntries = entries
    .map((entry) => {
      const parts = [
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
      ]

      if (entry.lastmod) {
        parts.push(`    <lastmod>${entry.lastmod}</lastmod>`)
      }

      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`
}

// ============================================================================
// Build Sitemap
// ============================================================================

/**
 * Build and write sitemap to file
 */
export function buildSitemap(config: SitemapConfig): SitemapResult {
  // Collect all pages
  const staticPages = getStaticPages()
  const resourcePages = getResourcePages()
  const allPages = [...staticPages, ...resourcePages]

  // Generate XML
  const xml = generateSitemapXml(allPages)

  // Ensure directory exists
  const dir = path.dirname(config.outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Write file
  fs.writeFileSync(config.outputPath, xml, 'utf-8')

  return {
    success: true,
    totalUrls: allPages.length,
    outputPath: config.outputPath,
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

// Only run if executed directly (not imported)
const isMainModule = process.argv[1]?.includes('generate-sitemap')

if (isMainModule) {
  const outputPath = path.resolve(process.cwd(), DEFAULT_OUTPUT)

  console.log('Generating sitemap...')

  const result = buildSitemap({
    baseUrl: BASE_URL,
    outputPath,
  })

  if (result.success) {
    console.log(`✅ Sitemap generated successfully!`)
    console.log(`   Total URLs: ${result.totalUrls}`)
    console.log(`   Output: ${result.outputPath}`)
  } else {
    console.error('❌ Failed to generate sitemap')
    process.exit(1)
  }
}
