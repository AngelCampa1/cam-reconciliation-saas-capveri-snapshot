import { supabase } from '@/lib/supabase'

export const LEASE_DOCUMENT_BUCKET = 'lease-documents'

export function getLeaseDocumentPath(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const publicUrlMatch = trimmed.match(/lease-documents\/(.+)$/)
  if (publicUrlMatch?.[1]) {
    return publicUrlMatch[1]
  }

  return trimmed.replace(/^\/+/, '')
}

export async function createLeaseDocumentSignedUrl(
  value: string,
  expiresIn = 3600
): Promise<string> {
  const path = getLeaseDocumentPath(value)
  if (!path) {
    throw new Error('Invalid lease document path')
  }

  const { data, error } = await supabase.storage
    .from(LEASE_DOCUMENT_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) {
    throw new Error(`Signed URL creation failed: ${error.message}`)
  }

  if (!data?.signedUrl) {
    throw new Error('Signed URL creation failed')
  }

  return data.signedUrl
}
