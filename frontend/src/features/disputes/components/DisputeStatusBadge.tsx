import { Badge } from '@/components/ui/badge'
import type { DisputeStatus } from '@/api/hooks'

type TenantDisputeStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'RESOLVED'
  | 'REJECTED'
  | 'CLOSED'

type Status = DisputeStatus | TenantDisputeStatus

const STATUS_CONFIG: Record<
  string,
  {
    label: string
    variant:
      | 'default'
      | 'secondary'
      | 'destructive'
      | 'outline'
      | 'warning'
      | 'success'
  }
> = {
  open: { label: 'Open', variant: 'warning' },
  under_review: { label: 'Under Review', variant: 'secondary' },
  resolved: { label: 'Resolved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  closed: { label: 'Closed', variant: 'outline' },
}

export function DisputeStatusBadge({ status }: { status: Status }) {
  const key = status.toLowerCase()
  const config = STATUS_CONFIG[key] ?? {
    label: key.replace(/_/g, ' '),
    variant: 'outline' as const,
  }

  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function isNeedsResponseStatus(status: Status) {
  return status.toLowerCase() === 'open'
}
