import { cn } from "@/lib/utils";
import { statusLabels, type DemoStatus } from "./demoData";

const statusStyles: Record<DemoStatus, string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  review: "border-amber-200 bg-amber-50 text-amber-800",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
  complete: "border-sky-200 bg-sky-50 text-sky-700",
};

export function StatusBadge({
  status,
  compact = false,
}: {
  status: DemoStatus;
  // Drop the fixed 80px min-width in cramped layouts (e.g. the 3-up KPI cards)
  // where it would otherwise overflow the card. Lists and the table keep it for
  // column alignment, where there is room.
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold",
        compact ? "min-w-0" : "min-w-20",
        statusStyles[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
