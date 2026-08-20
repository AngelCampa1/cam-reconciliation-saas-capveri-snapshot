/*
 * Pristine-sweep screenshot harness (local only — not product code).
 * Usage:
 *   node shoot.cjs login owner   # establish + persist a landlord session
 *   node shoot.cjs login tenant  # establish + persist a tenant session
 *   node shoot.cjs shot <role> <label> <path> [path2 ...]
 *       role: owner|tenant|anon   label: filename prefix
 *   node shoot.cjs raw <label> <url>   # one-off, no auth, current viewport both sizes
 *
 * Shots are written to ./shots/<label>__<desktop|mobile>.png (abs Windows path printed).
 * Sessions persisted to ./.state-<role>.json (gitignored).
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'playwright'))

const BASE = 'http://localhost:5174'
const HERE = __dirname
const SHOTS = path.join(HERE, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const CREDS = {
  owner: { email: 'owner@acme.example.com', password: 'TestPass123!', start: '/dashboard' },
  tenant: { email: 'sarah.tenant@retailstore.com', password: 'TestPass123!', start: '/portal/dashboard' },
}
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const statePath = (role) => path.join(HERE, `.state-${role}.json`)

async function doLogin(role) {
  const c = CREDS[role]
  if (!c) throw new Error('unknown role ' + role)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: DESKTOP })
  const page = await ctx.newPage()
  await page.goto(BASE + '/auth/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).first().fill(c.email)
  await page.getByLabel(/password/i).first().fill(c.password)
  await page.getByRole('button', { name: /sign in/i }).first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'), { timeout: 20000 })
  await page.waitForTimeout(1500)
  await ctx.storageState({ path: statePath(role) })
  console.log('LOGIN OK ' + role + ' -> ' + page.url())
  await browser.close()
}

async function shoot(role, label, routes) {
  const browser = await chromium.launch()
  const opts = role !== 'anon' && fs.existsSync(statePath(role))
    ? { storageState: statePath(role) }
    : {}
  const out = []
  for (const [vpName, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
    const ctx = await browser.newContext({ ...opts, viewport: vp })
    const page = await ctx.newPage()
    for (const route of routes) {
      const safe = (routes.length > 1 ? label + route.replace(/[^a-z0-9]+/gi, '_') : label)
      const file = path.join(SHOTS, `${safe}__${vpName}.png`)
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {})
        await page.waitForFunction(
          () => document.querySelectorAll('.animate-pulse, [data-slot="skeleton"], .skeleton').length === 0,
          { timeout: 9000 }
        ).catch(() => {})
        await page.waitForTimeout(900)
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
        out.push(file + ' (' + fs.statSync(file).size + 'b) url=' + page.url())
      } catch (e) {
        out.push('ERR ' + route + ' ' + vpName + ': ' + e.message)
      }
    }
    await ctx.close()
  }
  await browser.close()
  console.log(out.join('\n'))
}

;(async () => {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'login') await doLogin(rest[0])
  else if (cmd === 'shot') await shoot(rest[0], rest[1], rest.slice(2))
  else if (cmd === 'raw') await shoot('anon', rest[0], [rest[1]])
  else { console.log('unknown cmd'); process.exit(1) }
})().catch((e) => { console.error('FATAL ' + e.stack); process.exit(1) })
