import { StatusBadge } from "./StatusBadge";
import { reconciliationMetrics, reconciliationRows } from "./demoData";

export function ReconciliationDashboardMock() {
  return (
    <div aria-label="Synthetic reconciliation summary" className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {reconciliationMetrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-md border border-border bg-background p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-xs font-medium text-muted-foreground">
                {metric.label}
              </p>
              <StatusBadge status={metric.status} compact />
            </div>
            <p className="mt-3 text-2xl font-semibold text-foreground">
              {metric.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {metric.detail}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[520px] overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_1fr_0.9fr] bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>Property</span>
            <span>Period</span>
            <span>Recoverable</span>
            <span>Billed</span>
            <span>Variance</span>
            <span>Status</span>
          </div>
          {reconciliationRows.map((row) => (
            <div
              key={row.property}
              className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_1fr_0.9fr] items-center border-t border-border px-3 py-3 text-sm"
            >
              <span className="font-medium text-foreground">
                {row.property}
              </span>
              <span className="text-muted-foreground">{row.period}</span>
              <span className="text-foreground">{row.recoverable}</span>
              <span className="text-muted-foreground">{row.billed}</span>
              <span className="font-medium text-foreground">
                {row.variance}
              </span>
              <StatusBadge status={row.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
