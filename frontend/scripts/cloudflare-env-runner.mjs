import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const REQUIRED_VITE_ENV = [
  'VITE_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_TURNSTILE_SITE_KEY',
]

const DEPLOY_SAFE_URL_KEYS = ['VITE_API_URL', 'VITE_SUPABASE_URL']

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIR = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(FRONTEND_DIR, '..')
const WRANGLER_PATH = path.join(FRONTEND_DIR, 'wrangler.jsonc')

function unquoteEnvValue(value) {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed

  const first = trimmed.at(0)
  const last = trimmed.at(-1)
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

export function parseDotEnv(content) {
  const parsed = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const normalizedLine = line.startsWith('export ')
      ? line.slice(7).trim()
      : line
    const separatorIndex = normalizedLine.indexOf('=')
    if (separatorIndex === -1) continue

    const key = normalizedLine.slice(0, separatorIndex).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    parsed[key] = unquoteEnvValue(normalizedLine.slice(separatorIndex + 1))
  }

  return parsed
}

export async function applyEnvFiles({ rootDir, frontendDir, env }) {
  const nextEnv = { ...env }
  const protectedKeys = new Set(
    Object.entries(env)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key]) => key)
  )
  const envFiles = [
    path.join(rootDir, '.env'),
    path.join(frontendDir, '.env'),
    path.join(rootDir, '.env.local'),
    path.join(frontendDir, '.env.local'),
    path.join(frontendDir, '.env.production'),
    path.join(frontendDir, '.env.production.local'),
  ]

  for (const filePath of envFiles) {
    if (!existsSync(filePath)) continue

    const parsed = parseDotEnv(await readFile(filePath, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (protectedKeys.has(key)) continue
      nextEnv[key] = value
    }
  }

  return nextEnv
}

function stripJsoncComments(content) {
  return content
    .split('\n')
    .map((line) => {
      let inString = false
      let escaped = false
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index]
        if (escaped) {
          escaped = false
          continue
        }
        if (character === '\\' && inString) {
          escaped = true
          continue
        }
        if (character === '"') {
          inString = !inString
          continue
        }
        if (!inString && character === '/' && line[index + 1] === '/') {
          return line.slice(0, index)
        }
      }
      return line
    })
    .join('\n')
    .replace(/,(\s*[}\]])/g, '$1')
}

export async function applyWranglerVars({ wranglerPath = WRANGLER_PATH, env }) {
  if (!existsSync(wranglerPath)) return { ...env }

  const config = JSON.parse(
    stripJsoncComments(await readFile(wranglerPath, 'utf8'))
  )
  const vars = config.vars ?? {}
  const nextEnv = { ...env }

  for (const [key, value] of Object.entries(vars)) {
    if (nextEnv[key] !== undefined && nextEnv[key] !== '') continue
    if (typeof value === 'string') {
      nextEnv[key] = value
    }
  }

  return nextEnv
}

export function validateRequiredEnv(env) {
  const missing = REQUIRED_VITE_ENV.filter((key) => {
    const value = env[key]
    return value === undefined || value.trim() === ''
  })

  if (missing.length > 0) {
    throw new Error(
      `Missing required Cloudflare frontend env variables: ${missing.join(', ')}`
    )
  }

  for (const key of DEPLOY_SAFE_URL_KEYS) {
    validateDeploySafeUrl(key, env[key])
  }
}

function validateDeploySafeUrl(key, value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${key} must be an absolute https URL. Received: ${value}`)
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      `${key} must use https for Cloudflare production builds. Received: ${value}`
    )
  }

  const hostname = url.hostname.toLowerCase()
  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
  if (localHosts.has(hostname) || hostname.endsWith('.localhost')) {
    throw new Error(
      `${key} cannot point at a local address for Cloudflare production builds. Received: ${value}`
    )
  }

  if (key === 'VITE_API_URL' && url.pathname !== '/' && url.pathname !== '') {
    throw new Error(
      `${key} must be an API origin without a path, for example https://api.capveri.com. Received: ${value}`
    )
  }
}

export function getCommandPlan(commandName) {
  if (commandName === 'build') {
    return [['npm', ['run', 'build']]]
  }

  if (commandName === 'deploy') {
    return [
      ['npm', ['run', 'build']],
      ['npx', ['wrangler', 'deploy']],
    ]
  }

  if (commandName === 'dry-run') {
    return [
      ['npm', ['run', 'build']],
      ['npx', ['wrangler', 'deploy', '--dry-run']],
    ]
  }

  throw new Error(`Unknown Cloudflare frontend command: ${commandName}`)
}

async function runCommand(command, args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: FRONTEND_DIR,
      env,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function main() {
  const commandName = process.argv[2]
  const envWithWrangler = await applyWranglerVars({
    wranglerPath: WRANGLER_PATH,
    env: process.env,
  })
  const env = await applyEnvFiles({
    rootDir: REPO_ROOT,
    frontendDir: FRONTEND_DIR,
    env: envWithWrangler,
  })

  validateRequiredEnv(env)
  console.log(
    `Cloudflare frontend ${commandName}: required Vite env present (${REQUIRED_VITE_ENV.join(', ')})`
  )

  for (const [command, args] of getCommandPlan(commandName)) {
    await runCommand(command, args, env)
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
