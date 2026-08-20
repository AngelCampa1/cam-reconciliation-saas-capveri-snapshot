import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { exceptions } from "./demoData";

export function ExceptionQueueMock() {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div
        aria-label="Synthetic exception queue preview"
        className="min-w-[560px] rounded-md border border-border bg-background sm:min-w-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="h-4 w-4 text-primary"
              aria-hidden="true"
            />
            <h3 className="text-sm font-semibold text-foreground">
              Exception queue
            </h3>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            Ranked by reconciliation impact
          </span>
        </div>
        <div className="divide-y divide-border">
          {exceptions.map((item) => (
            <div
              key={item.title}
              className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.6fr_0.8fr] items-center gap-2 px-3 py-3 text-sm"
            >
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="text-muted-foreground">{item.owner}</span>
              <span className="font-medium text-foreground">{item.amount}</span>
              <span className="text-muted-foreground">{item.age}</span>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
