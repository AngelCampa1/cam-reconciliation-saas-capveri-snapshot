import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { resolveApiUrl } from '@/api/url'

export interface FreeAuditStatus {
  has_subscription: boolean
  has_paused_subscription: boolean
  free_audit_consumed: boolean
  can_add_property: boolean
  can_run_reconciliation: boolean
  can_view_draft_report: boolean
  can_download_reports: boolean
  credit_balance: {
    total_purchased: number
    total_used: number
    total_remaining: number
  }
  has_ever_purchased: boolean
}

export const freeAuditStatusKeys = {
  all: ['free-audit-status'] as const,
}

export function useFreeAuditStatus() {
  return useQuery<FreeAuditStatus>({
    queryKey: freeAuditStatusKeys.all,
    throwOnError: false,
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch(
        resolveApiUrl('/api/v1/billing/free-audit-status'),
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        }
      )

      if (!response.ok) {
        throw new Error('Failed to load free audit status')
      }

      return (await response.json()) as FreeAuditStatus
    },
  })
}
