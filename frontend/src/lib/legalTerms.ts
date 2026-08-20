export const TERMS_VERSION = '2026-06-03'
export const TERMS_EFFECTIVE_DATE = 'June 3, 2026'
export const TERMS_HASH =
  'sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a'

export const currentTermsAcceptance = {
  accepted_terms: true,
  terms_version: TERMS_VERSION,
  terms_hash: TERMS_HASH,
} as const
