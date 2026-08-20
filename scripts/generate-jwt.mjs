#!/usr/bin/env node
/**
 * Generate Supabase Service Role JWT
 *
 * Generates a valid service_role JWT for local Supabase development
 */
import { createHmac } from 'crypto'

const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'

const header = {
  alg: 'HS256',
  typ: 'JWT'
}

const payload = {
  iss: 'supabase',
  ref: 'capveri',
  role: 'service_role',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 60 * 60), // 100 years
}

// Base64 URL encode
const base64url = (str) => {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

const headerEncoded = base64url(JSON.stringify(header))
const payloadEncoded = base64url(JSON.stringify(payload))
const toSign = `${headerEncoded}.${payloadEncoded}`

// Sign with HMAC SHA256
const signature = createHmac('sha256', JWT_SECRET)
  .update(toSign)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '')

const token = `${toSign}.${signature}`

console.log('Generated Service Role JWT:')
console.log(token)
console.log('\nCopy this token to frontend/e2e/setup.ts as SUPABASE_SERVICE_KEY')
