import { FileCheck2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { leaseRules } from "./demoData";

export function LeaseRulesMock() {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <div
        aria-label="Synthetic lease rules preview"
        className="min-w-[560px] rounded-md border border-border bg-background sm:min-w-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <FileCheck2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">
            Lease rules mapped to CAM logic
          </h3>
        </div>
        <div className="divide-y divide-border">
          {leaseRules.map((rule) => (
            <div
              key={`${rule.tenant}-${rule.rule}`}
              className="grid grid-cols-[0.7fr_1.25fr_1fr_0.8fr_0.8fr] items-center gap-2 px-3 py-3 text-sm"
            >
              <span className="font-semibold text-foreground">
                {rule.tenant}
              </span>
              <span className="text-foreground">{rule.rule}</span>
              <span className="text-muted-foreground">{rule.source}</span>
              <span className="text-muted-foreground">{rule.confidence}</span>
              <StatusBadge status={rule.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
