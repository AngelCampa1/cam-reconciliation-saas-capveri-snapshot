import {
  Clock,
  Loader2,
  Eye,
  CheckCircle2,
  XCircle,
  Ban,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DocumentStatus } from '@/types/enums'

/**
 * Visual configuration for a single document status.
 *
 * Each status pairs a distinct semantic color with its own icon so the value
 * stays distinguishable for colorblind and low-vision users (color is never
 * the only cue). Labels use Title Case to match the status filter and the
 * app's other status badges (disputes, reconciliation).
 */
interface StatusVisual {
  label: string
  icon: LucideIcon
  className: string
  /** Spin the icon to signal in-progress work. */
  spin?: boolean
}

const STATUS_VISUALS: Record<string, StatusVisual> = {
  [DocumentStatus.PENDING]: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-muted text-muted-foreground',
  },
  [DocumentStatus.PROCESSING]: {
    label: 'Processing',
    icon: Loader2,
    className: 'bg-primary/10 text-primary',
    spin: true,
  },
  [DocumentStatus.READY_FOR_REVIEW]: {
    label: 'Ready for Review',
    icon: Eye,
    className: 'bg-warning/10 text-warning-foreground',
  },
  [DocumentStatus.COMPLETED]: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-success/10 text-success-strong',
  },
  [DocumentStatus.VERIFIED]: {
    label: 'Verified',
    icon: CheckCircle2,
    className: 'bg-success/10 text-success-strong',
  },
  [DocumentStatus.FAILED]: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-destructive/10 text-destructive-strong',
  },
  [DocumentStatus.REJECTED]: {
    label: 'Rejected',
    icon: Ban,
    className: 'bg-destructive/10 text-destructive-strong',
  },
}

const FALLBACK_VISUAL: StatusVisual = {
  label: 'Unknown',
  icon: CircleHelp,
  className: 'bg-muted text-muted-foreground',
}

/**
 * Build a readable fallback label from an unexpected status string
 * (e.g. "needs_attention" becomes "Needs attention").
 */
function humanizeStatus(status: string): string {
  const spaced = status.replace(/_/g, ' ').trim()
  if (!spaced) return FALLBACK_VISUAL.label
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

/**
 * Accessible status chip for document extractions.
 *
 * Shared by both the desktop table and the mobile card so the two views stay
 * visually consistent. Each status has its own color and icon.
 */
export function ExtractionStatusBadge({ status }: { status: string }) {
  const visual = STATUS_VISUALS[status]
  const {
    label,
    icon: Icon,
    className,
    spin,
  } = visual ?? {
    ...FALLBACK_VISUAL,
    label: humanizeStatus(status),
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        className
      )}
      data-testid={`status-badge-${status}`}
    >
      <Icon
        className={cn('h-3.5 w-3.5', spin && 'animate-spin')}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
