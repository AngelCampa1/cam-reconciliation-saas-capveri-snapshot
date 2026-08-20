import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

const publicDir = path.resolve(__dirname, '../../public')
const projectDir = path.resolve(__dirname, '../..')

let robotsTxt: string
let manifestJson: Record<string, unknown>
let edgeHeaderMap: Map<string, string>
let indexHtml: string
let workerSource: string
let wranglerConfig: string

function parseHeaderFile(raw: string): Map<string, string> {
  const headers = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s{2}([^:]+):\s*(.+)$/)
    if (match) {
      headers.set(match[1], match[2])
    }
  }
  return headers
}

beforeAll(() => {
  robotsTxt = readFileSync(path.join(publicDir, 'robots.txt'), 'utf-8')
  manifestJson = JSON.parse(
    readFileSync(path.join(publicDir, 'manifest.json'), 'utf-8')
  )
  edgeHeaderMap = parseHeaderFile(
    readFileSync(path.join(publicDir, '_headers'), 'utf-8')
  )
  indexHtml = readFileSync(path.join(projectDir, 'index.html'), 'utf-8')
  workerSource = readFileSync(path.join(projectDir, 'src/worker.ts'), 'utf-8')
  wranglerConfig = readFileSync(
    path.join(projectDir, 'wrangler.jsonc'),
    'utf-8'
  )
})

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

describe('robots.txt — wildcard block (covers all AI search crawlers)', () => {
  // AI search crawlers (GPTBot, PerplexityBot, ClaudeBot, Google-Extended,
  // ChatGPT-User, anthropic-ai) intentionally have no named blocks.
  // Per RFC 9309, named blocks override the wildcard entirely — a named
  // "Allow: /" block would lose all the private-path Disallow rules unless
  // every path were duplicated. The wildcard approach is simpler and correct:
  // all crawlers inherit Allow: / and the private-path disallows below.

  it('allows all crawlers at the root via wildcard', () => {
    expect(robotsTxt).toMatch(/User-agent: \*[\s\S]*?Allow: \//)
  })

  it('disallows /app/ for all crawlers via wildcard', () => {
    expect(robotsTxt).toMatch(/User-agent: \*[\s\S]*?Disallow: \/app\//)
  })

  it('disallows /dashboard/ for all crawlers via wildcard', () => {
    expect(robotsTxt).toMatch(/User-agent: \*[\s\S]*?Disallow: \/dashboard\//)
  })

  it('does not advertise an app-domain sitemap', () => {
    expect(robotsTxt).not.toMatch(/^Sitemap:/m)
  })

  it('does not define named allow blocks that bypass private-path disallows', () => {
    for (const crawler of [
      'GPTBot',
      'ChatGPT-User',
      'PerplexityBot',
      'ClaudeBot',
      'anthropic-ai',
      'Google-Extended',
    ]) {
      expect(robotsTxt).not.toContain(`User-agent: ${crawler}`)
    }
  })
})

describe('robots.txt — CCBot block (training-only crawler)', () => {
  it('explicitly blocks CCBot', () => {
    expect(robotsTxt).toContain('User-agent: CCBot')
  })

  it('CCBot block uses full root Disallow (not a partial path)', () => {
    const ccbotIndex = robotsTxt.indexOf('User-agent: CCBot')
    expect(ccbotIndex).toBeGreaterThan(-1)
    // Slice from CCBot declaration to end and check Disallow: / appears before
    // the next User-agent directive (or end of file)
    const afterCcbot = robotsTxt.slice(ccbotIndex)
    const nextAgentIndex = afterCcbot.indexOf(
      'User-agent:',
      'User-agent: CCBot'.length
    )
    const ccbotBlock =
      nextAgentIndex === -1 ? afterCcbot : afterCcbot.slice(0, nextAgentIndex)
    expect(ccbotBlock).toMatch(/Disallow: \/\n/)
  })

  it('CCBot block does not contain Allow: / (must not slip through)', () => {
    const ccbotIndex = robotsTxt.indexOf('User-agent: CCBot')
    const afterCcbot = robotsTxt.slice(ccbotIndex)
    const nextAgentIndex = afterCcbot.indexOf(
      'User-agent:',
      'User-agent: CCBot'.length
    )
    const ccbotBlock =
      nextAgentIndex === -1 ? afterCcbot : afterCcbot.slice(0, nextAgentIndex)
    expect(ccbotBlock).not.toContain('Allow: /')
  })
})

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------

describe('sitemap.xml - app deployment', () => {
  it('does not ship an app-domain sitemap', () => {
    expect(existsSync(path.join(publicDir, 'sitemap.xml'))).toBe(false)
  })
})
describe('app-domain indexation controls', () => {
  it('sets X-Robots-Tag noindex and nofollow on all app routes at the edge', () => {
    expect(edgeHeaderMap.get('X-Robots-Tag')).toBe('noindex, nofollow')
  })

  it('sets app security headers that block framing and constrain script execution', () => {
    expect(edgeHeaderMap.get('X-Frame-Options')).toBe('DENY')
    expect(workerSource).toContain("frame-ancestors 'none'")
    expect(workerSource).toContain("script-src 'self'")
    expect(workerSource).not.toContain('va.vercel-scripts.com')
    expect(workerSource).not.toContain('googletagmanager.com')
    expect(edgeHeaderMap.get('X-Content-Type-Options')).toBe('nosniff')
    expect(edgeHeaderMap.get('Strict-Transport-Security')).toContain(
      'includeSubDomains'
    )
  })

  it('runs the Worker ahead of static assets so security headers reach index.html', () => {
    // Without run_worker_first, Cloudflare serves real asset files (e.g. "/" ->
    // index.html) straight from the asset cache and never invokes the Worker,
    // so withSecurityHeaders() (CSP/HSTS/noindex) is absent on the root document.
    expect(wranglerConfig).toMatch(/"run_worker_first":\s*true/)
  })

  it('does not load GTM or GA scripts in the authenticated app shell', () => {
    expect(indexHtml).not.toContain('googletagmanager.com')
    expect(indexHtml).not.toContain('VITE_GTM_ID')
    expect(indexHtml).not.toContain('VITE_GA_ID')
  })

  it('does not expose a broken PWA share_target', () => {
    expect(manifestJson).not.toHaveProperty('share_target')
  })

  it('does not declare the marketing homepage as the SPA canonical URL', () => {
    expect(indexHtml).not.toContain(
      '<link rel="canonical" href="https://www.capveri.com/"'
    )
  })
})
