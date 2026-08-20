import { ClipboardCheck } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { auditPacketItems } from "./demoData";

export function AuditPacketMock() {
  return (
    <div
      aria-label="Synthetic audit packet preview"
      className="rounded-md border border-border bg-background p-3"
    >
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">
          Tenant-ready audit packet
        </h3>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {auditPacketItems.map((item) => (
          <div
            key={item.label}
            className="rounded-md border border-border bg-card p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                {item.label}
              </p>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
