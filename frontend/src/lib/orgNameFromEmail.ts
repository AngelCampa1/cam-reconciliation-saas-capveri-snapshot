/**
 * Derive a default organization name from a user's email address.
 *
 * Used at signup when the user doesn't provide an explicit org name. They can
 * always rename their workspace later from settings.
 *
 * Behavior:
 * - Free-mail domains (gmail, outlook, etc.) fall back to "My Workspace"
 *   because the domain isn't the company.
 * - Otherwise, the first segment of the domain becomes the name, with hyphens
 *   converted to spaces and each word title-cased. `acme-properties.com` →
 *   `Acme Properties`.
 */

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'mail.com',
  'gmx.com',
  'gmx.net',
  'fastmail.com',
  'zoho.com',
  'yandex.com',
  'yandex.ru',
  'qq.com',
  '163.com',
  '126.com',
])

const FALLBACK_NAME = 'My Workspace'
const MAX_LENGTH = 64

export function orgNameFromEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at === -1 || at === email.length - 1) return FALLBACK_NAME

  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .trim()
  if (!domain) return FALLBACK_NAME
  if (FREE_MAIL_DOMAINS.has(domain)) return FALLBACK_NAME

  const firstSegment = domain.split('.')[0]
  if (!firstSegment) return FALLBACK_NAME

  // IDN/punycode domains (e.g. "xn--mnchen-3ya") would produce gibberish org
  // names; fall back rather than show the encoded form.
  if (firstSegment.startsWith('xn--')) return FALLBACK_NAME

  const titled = firstSegment
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return titled.length > MAX_LENGTH ? titled.slice(0, MAX_LENGTH) : titled
}
