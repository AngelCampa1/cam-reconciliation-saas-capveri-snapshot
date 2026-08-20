import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyEnvFiles,
  applyWranglerVars,
  getCommandPlan,
  validateRequiredEnv,
} from './cloudflare-env-runner.mjs'

describe('frontend cloudflare-env-runner', () => {
  it('deploy builds with validated Vite env before wrangler deploy', () => {
    expect(getCommandPlan('deploy')).toEqual([
      ['npm', ['run', 'build']],
      ['npx', ['wrangler', 'deploy']],
    ])
  })

  it('requires production Vite env for Cloudflare builds', () => {
    expect(() => validateRequiredEnv({})).toThrow(
      /Missing required Cloudflare frontend env variables/
    )
  })

  it('accepts production-shaped Vite env', () => {
    validateRequiredEnv({
      VITE_API_URL: 'https://api.capveri.com',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    })
  })

  it('loads wrangler vars before local env files', async () => {
    const rootDir = await mkdtemp(
      path.join(os.tmpdir(), 'capveri-app-cf-root-')
    )
    const frontendDir = path.join(rootDir, 'frontend')
    await mkdir(frontendDir)
    const wranglerPath = path.join(frontendDir, 'wrangler.jsonc')
    await writeFile(
      wranglerPath,
      JSON.stringify({
        vars: {
          VITE_API_URL: 'https://api.capveri.com',
        },
      })
    )
    await writeFile(
      path.join(frontendDir, '.env.local'),
      [
        'VITE_API_URL=http://localhost:8000',
        'VITE_SUPABASE_URL=https://example.supabase.co',
        'VITE_SUPABASE_ANON_KEY=anon-key',
        'VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA',
      ].join('\n')
    )

    const wranglerEnv = await applyWranglerVars({ wranglerPath, env: {} })
    const loaded = await applyEnvFiles({
      rootDir,
      frontendDir,
      env: wranglerEnv,
    })

    expect(loaded.VITE_API_URL).toBe('https://api.capveri.com')
    expect(loaded.VITE_SUPABASE_URL).toBe('https://example.supabase.co')
  })
})
