/**
 * AllClearState Component
 *
 * Positive "all clear" state for dashboard cards — a green success check with a
 * short reassurance line. This is distinct from the neutral `EmptyState`
 * (no-data, go-add-something): here there is simply nothing that needs the
 * user's attention, and that is a good thing, so it keeps the success-green
 * treatment. Shared by AlertsCard and ReconciliationStatusCard so the
 * no-pending state renders identically across the dashboard.
 */
import { Check } from 'lucide-react'

interface AllClearStateProps {
  /** Short reassurance line, e.g. "All caught up! No pending actions." */
  message: string
}

export function AllClearState({ message }: AllClearStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
        <Check className="h-5 w-5 text-success" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
