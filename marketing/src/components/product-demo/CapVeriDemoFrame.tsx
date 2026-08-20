import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CapVeriDemoFrameProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function CapVeriDemoFrame({
  title = "Reconciliation dashboard",
  subtitle = "Demo data only. No customer records, screenshots, or imported files.",
  children,
  className,
}: CapVeriDemoFrameProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      aria-label={title}
    >
      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Product preview
          </p>
          {/* The section is already named via aria-label={title}, so this
              visible title is a widget label, not a document-outline heading.
              Rendering it as <p> avoids nesting an <h2> under the surrounding
              page heading across this frame's several usages. */}
          <p className="mt-1 text-base font-semibold text-foreground sm:text-lg">
            {title}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Sample data
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
