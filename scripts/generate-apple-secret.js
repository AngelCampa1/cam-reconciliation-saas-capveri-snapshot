/**
 * Generate Apple Sign In client secret (JWT)
 *
 * Usage: node scripts/generate-apple-secret.js
 *
 * Before running, update the values below with your Apple credentials.
 */

const crypto = require('crypto');

// ============ UPDATE THESE VALUES ============
const TEAM_ID = 'REDACTED_APPLE_TEAM_ID';           // Your Apple Team ID
const KEY_ID = 'YOUR_KEY_ID';            // The Key ID from Apple (10 characters)
const CLIENT_ID = 'com.capveri.signin';  // Your Services ID

// Paste your .p8 key contents here (including BEGIN/END lines)
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
PASTE_YOUR_KEY_HERE
-----END PRIVATE KEY-----`;
// =============================================

function generateAppleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + (86400 * 180); // 180 days (max allowed)

  const header = {
    alg: 'ES256',
    kid: KEY_ID,
    typ: 'JWT'
  };

  const payload = {
    iss: TEAM_ID,
    iat: now,
    exp: expiry,
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(PRIVATE_KEY);

  // Convert DER signature to raw r||s format for ES256
  const derSignature = signature;
  let offset = 3;
  const rLength = derSignature[offset];
  offset += 1;
  let r = derSignature.slice(offset, offset + rLength);
  offset += rLength + 1;
  const sLength = derSignature[offset];
  offset += 1;
  let s = derSignature.slice(offset, offset + sLength);

  // Remove leading zeros if present
  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);

  // Pad if needed
  if (r.length < 32) r = Buffer.concat([Buffer.alloc(32 - r.length), r]);
  if (s.length < 32) s = Buffer.concat([Buffer.alloc(32 - s.length), s]);

  const rawSignature = Buffer.concat([r, s]).toString('base64url');

  const jwt = `${signatureInput}.${rawSignature}`;

  console.log('\n========== APPLE CLIENT SECRET ==========\n');
  console.log(jwt);
  console.log('\n==========================================');
  console.log('\nCopy the JWT above and paste it into Supabase Apple provider settings.');
  console.log(`\nThis secret expires: ${new Date(expiry * 1000).toISOString()}`);

  return jwt;
}

generateAppleClientSecret();
