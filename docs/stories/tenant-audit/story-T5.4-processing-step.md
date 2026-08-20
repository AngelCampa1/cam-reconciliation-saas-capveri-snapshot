# Story T5.4: Processing Step

## Story Info
- **Epic**: T5 — Audit Wizard
- **Estimated Hours**: 6
- **Dependencies**: T1.4 (status polling endpoint), T5.3 (Checkout Step)
- **Status**: `pending`

## User Story
As a commercial tenant who has paid for an audit, I want to see real-time progress of my audit processing so that I know my report is being generated and can return later if needed.

## Acceptance Criteria
- Processing step shown when audit status is `paid` or `processing`
- Real-time status polling via `GET /api/v1/tenant-audits/{token}` every 3 seconds
- Five processing phases displayed as a vertical step indicator:
  1. Payment confirmed
  2. Extracting lease terms
  3. Extracting CAM statement
  4. Calculating discrepancies
  5. Generating report
- Each phase shows one of: completed (checkmark), in-progress (spinner), or pending (gray circle)
- Overall progress bar reflects completion percentage
- "Bookmark this page" message displayed with the current URL
- "We'll email your report to {email}" message displayed
- When processing completes (status=`completed`), automatically transitions to ReportViewer
- If processing fails (status=`failed`), shows error message with refund notice
- Polling stops when status is `completed` or `failed`

## Technical Specifications

### Processing Phase Types

```typescript
// marketing-tenant/src/types/tenant-audit.ts

export type ProcessingPhase =
  | "payment_confirmed"
  | "extracting_lease"
  | "extracting_cam"
  | "calculating"
  | "generating_report";

export interface TenantAudit {
  id: string;
  access_token: string;
  status: "created" | "payment_pending" | "paid" | "processing" | "completed" | "failed" | "refunded";
  email: string | null;
  tier: "standard" | "detailed" | "expert" | null;
  property_name: string | null;
  tenant_name: string | null;
  suite_number: string | null;
  current_phase: ProcessingPhase | null;
  created_at: string;
  updated_at: string;
}
```

### PhaseIndicator Component

```typescript
// marketing-tenant/src/components/audit/PhaseIndicator.tsx
"use client";

import { Check, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type PhaseStatus = "completed" | "in-progress" | "pending";

interface PhaseIndicatorProps {
  label: string;
  status: PhaseStatus;
  isLast?: boolean;
}

export function PhaseIndicator({ label, status, isLast = false }: PhaseIndicatorProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            status === "completed" && "bg-primary text-primary-foreground",
            status === "in-progress" && "bg-primary/20 text-primary",
            status === "pending" && "bg-muted text-muted-foreground",
          )}
        >
          {status === "completed" && <Check className="h-4 w-4" />}
          {status === "in-progress" && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {status === "pending" && <Circle className="h-3 w-3" />}
        </div>
        {!isLast && (
          <div
            className={cn(
              "mt-1 h-6 w-0.5",
              status === "completed" ? "bg-primary" : "bg-muted",
            )}
          />
        )}
      </div>

      <p
        className={cn(
          "pt-1 text-sm font-medium",
          status === "completed" && "text-foreground",
          status === "in-progress" && "text-primary",
          status === "pending" && "text-muted-foreground",
        )}
      >
        {label}
      </p>
    </div>
  );
}
```

### ProcessingStep Component

```typescript
// marketing-tenant/src/components/audit/ProcessingStep.tsx
"use client";

import { useMemo } from "react";
import { Bookmark, Mail } from "lucide-react";
import { PhaseIndicator, type PhaseStatus } from "./PhaseIndicator";
import { Progress } from "@/components/ui/progress";
import { useTenantAuditPolling } from "@/hooks/use-tenant-audit";
import type { TenantAudit, ProcessingPhase } from "@/types/tenant-audit";

const PHASES: { key: ProcessingPhase; label: string }[] = [
  { key: "payment_confirmed", label: "Payment confirmed" },
  { key: "extracting_lease", label: "Extracting lease terms" },
  { key: "extracting_cam", label: "Extracting CAM statement" },
  { key: "calculating", label: "Calculating discrepancies" },
  { key: "generating_report", label: "Generating report" },
];

function getPhaseIndex(phase: ProcessingPhase | null): number {
  if (!phase) return 0;
  const idx = PHASES.findIndex((p) => p.key === phase);
  return idx === -1 ? 0 : idx;
}

function getPhaseStatus(
  phaseIndex: number,
  currentIndex: number,
  isCompleted: boolean,
): PhaseStatus {
  if (isCompleted) return "completed";
  if (phaseIndex < currentIndex) return "completed";
  if (phaseIndex === currentIndex) return "in-progress";
  return "pending";
}

interface ProcessingStepProps {
  audit: TenantAudit;
}

export function ProcessingStep({ audit: initialAudit }: ProcessingStepProps) {
  const isTerminal =
    initialAudit.status === "completed" || initialAudit.status === "failed";

  const { data: audit } = useTenantAuditPolling(
    initialAudit.access_token,
    {
      enabled: !isTerminal,
      refetchInterval: 3_000,
      initialData: initialAudit,
    },
  );

  const currentAudit = audit ?? initialAudit;
  const isCompleted = currentAudit.status === "completed";
  const isFailed = currentAudit.status === "failed";
  const currentPhaseIndex = getPhaseIndex(currentAudit.current_phase);

  const progressPercent = useMemo(() => {
    if (isCompleted) return 100;
    if (isFailed) return currentPhaseIndex * (100 / PHASES.length);
    return ((currentPhaseIndex + 0.5) / PHASES.length) * 100;
  }, [isCompleted, isFailed, currentPhaseIndex]);

  if (isFailed) {
    return (
      <div className="mx-auto max-w-md space-y-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-destructive">
          Processing Failed
        </h2>
        <p className="text-muted-foreground">
          We were unable to complete your audit. A full refund has been
          automatically issued to your payment method. You should see it within
          5-10 business days.
        </p>
        <p className="text-sm text-muted-foreground">
          If you have questions, contact{" "}
          <a
            href="mailto:angel.campa@capveri.com"
            className="text-primary underline"
          >
            angel.campa@capveri.com
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          {isCompleted ? "Audit Complete" : "Analyzing Your Documents"}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {isCompleted
            ? "Your report is ready!"
            : "This usually takes 2-5 minutes."}
        </p>
      </div>

      {/* Progress bar */}
      <Progress value={progressPercent} className="h-2" />

      {/* Phase indicators */}
      <div className="space-y-0">
        {PHASES.map((phase, idx) => (
          <PhaseIndicator
            key={phase.key}
            label={phase.label}
            status={getPhaseStatus(idx, currentPhaseIndex, isCompleted)}
            isLast={idx === PHASES.length - 1}
          />
        ))}
      </div>

      {/* Info messages */}
      {!isCompleted && (
        <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-2 text-sm">
            <Bookmark className="h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong>Bookmark this page</strong> to check back later:
            </span>
          </div>
          <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
            {typeof window !== "undefined" ? window.location.href : ""}
          </code>

          {currentAudit.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 shrink-0 text-primary" />
              <span>
                We&apos;ll email your report to{" "}
                <strong>{currentAudit.email}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Polling Hook

```typescript
// Additions to marketing-tenant/src/hooks/use-tenant-audit.ts

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { TenantAudit } from "@/types/tenant-audit";

export function useTenantAuditPolling(
  accessToken: string,
  options?: Partial<UseQueryOptions<TenantAudit>> & {
    refetchInterval?: number;
  },
) {
  return useQuery<TenantAudit>({
    queryKey: ["tenant-audit", accessToken],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/tenant-audits/${accessToken}`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch audit status (${response.status})`);
      }

      return response.json();
    },
    refetchInterval: options?.refetchInterval ?? false,
    ...options,
  });
}
```

## Test Cases
- Processing step renders when audit status is `paid`
- Processing step renders when audit status is `processing`
- Polling fires every 3 seconds when status is not terminal
- Polling stops when status changes to `completed`
- Polling stops when status changes to `failed`
- Phase indicator shows "completed" (checkmark) for completed phases
- Phase indicator shows "in-progress" (spinner) for current phase
- Phase indicator shows "pending" (gray) for future phases
- Progress bar reflects correct percentage based on current phase
- Progress bar shows 100% when completed
- "Bookmark this page" message includes the current URL
- "We'll email your report" message shows the user's email
- Failed status shows error message with refund notice
- Failed status shows support email link
- Completed status shows "Audit Complete" heading
- Phase transitions animate correctly (spinner to checkmark)

## Definition of Done
- [ ] `PhaseIndicator` component renders three states (completed, in-progress, pending)
- [ ] `ProcessingStep` maps audit phase to correct phase indicator states
- [ ] Status polling implemented at 3-second intervals via TanStack Query
- [ ] Polling stops on terminal states (`completed`, `failed`)
- [ ] Progress bar reflects current phase completion
- [ ] Bookmark URL and email notification messages displayed
- [ ] Failed state shows refund notice and support contact
- [ ] Unit tests for `PhaseIndicator` (all three states)
- [ ] Unit tests for `ProcessingStep` (phase mapping, progress calculation)
- [ ] Unit tests for polling behavior (start, stop on terminal)
- [ ] Unit tests for failed state rendering
