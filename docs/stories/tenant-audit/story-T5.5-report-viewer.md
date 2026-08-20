# Story T5.5: Report Viewer

## Story Info
- **Epic**: T5 — Audit Wizard
- **Estimated Hours**: 11
- **Dependencies**: T1.4 (report endpoint), T3 (calculation engine output), T5.4 (Processing Step)
- **Status**: `pending`

## User Story
As a commercial tenant whose audit is complete, I want to view a clear, actionable report showing any CAM overcharges so that I can understand exactly where I'm being overcharged and take steps to recover the money.

## Acceptance Criteria
- Report viewer shown when audit status is `completed`
- **Executive Summary** section displays:
  - Total overcharge amount (formatted as currency)
  - Number of discrepancies found
  - Overall confidence score (percentage)
  - Verdict badge (e.g.,"Significant Overcharge","Minor Discrepancies","No Issues Found")
- **Discrepancy Table** shows all identified discrepancies:
  - Columns: Category, Landlord Value, Correct Value, Difference, Severity
  - Severity shown as color-coded badges (High=red, Medium=amber, Low=gray)
  - Sortable by any column
  - Empty state if no discrepancies found
- **Detailed Findings** section (Detailed and Expert tiers only):
  - Per-discrepancy narrative explanation
  - Lease clause references where applicable
  - Confidence indicator per finding
- **Calculation Trace** section (Detailed and Expert tiers only):
  - Step-by-step calculation methodology
  - Input values, formulas applied, and resulting values
  - Expandable/collapsible per discrepancy
- **Download PDF** button calls `GET /api/v1/tenant-audits/{token}/report` and triggers browser download
- **Next Steps** section with actionable guidance
- Responsive layout for mobile viewing
- Print-friendly styling

## Technical Specifications

### Report Types

```typescript
// marketing-tenant/src/types/audit-report.ts

export type Severity ="high" |"medium" |"low";
export type Verdict ="significant_overcharge" |"minor_discrepancies" |"no_issues";

export interface ExecutiveSummary {
  total_overcharge: string; // Decimal string, e.g.,"3,847.50"
  total_overcharge_raw: number; // Numeric for comparisons
  discrepancy_count: number;
  confidence_score: number; // 0.0 - 1.0
  verdict: Verdict;
  verdict_label: string;
  summary_text: string;
}

export interface Discrepancy {
  id: string;
  category: string;
  landlord_value: string; // Formatted currency
  correct_value: string;
  difference: string;
  difference_raw: number;
  severity: Severity;
  description: string;
  lease_clause?: string;
  confidence: number;
}

export interface CalculationStep {
  label: string;
  input: string;
  formula: string;
  result: string;
}

export interface DetailedFinding {
  discrepancy_id: string;
  narrative: string;
  lease_clause_reference: string | null;
  confidence: number;
  calculation_trace: CalculationStep[];
}

export interface AuditReport {
  executive_summary: ExecutiveSummary;
  discrepancies: Discrepancy[];
  detailed_findings: DetailedFinding[] | null; // null for Standard tier
  tier:"standard" |"detailed" |"expert";
  generated_at: string;
}
```

### ExecutiveSummary Component

```typescript
// marketing-tenant/src/components/audit/report/ExecutiveSummary.tsx"use client";

import { AlertTriangle, CheckCircle, Info } from"lucide-react";
import { cn } from"@/lib/utils";
import type { ExecutiveSummary as ExecutiveSummaryType, Verdict } from"@/types/audit-report";

const VERDICT_CONFIG: Record<
  Verdict,
  { icon: typeof AlertTriangle; className: string }
> = {
  significant_overcharge: {
    icon: AlertTriangle,
    className:"border-red-200 bg-red-50 text-red-800",
  },
  minor_discrepancies: {
    icon: Info,
    className:"border-amber-200 bg-amber-50 text-amber-800",
  },
  no_issues: {
    icon: CheckCircle,
    className:"border-green-200 bg-green-50 text-green-800",
  },
};

interface ExecutiveSummaryProps {
  summary: ExecutiveSummaryType;
}

export function ExecutiveSummary({ summary }: ExecutiveSummaryProps) {
  const verdict = VERDICT_CONFIG[summary.verdict];
  const VerdictIcon = verdict.icon;

  return (
    <section aria-labelledby="executive-summary-heading" className="space-y-4">
      <h2 id="executive-summary-heading" className="text-xl font-bold">
        Executive Summary
      </h2>

      {/* Verdict banner */}
      <div
        className={cn("flex items-center gap-3 rounded-lg border p-4",
          verdict.className,
        )}
      >
        <VerdictIcon className="h-6 w-6 shrink-0" />
        <div>
          <p className="font-semibold">{summary.verdict_label}</p>
          <p className="text-sm">{summary.summary_text}</p>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Total Overcharge</p>
          <p className="text-3xl font-bold text-destructive">
            ${summary.total_overcharge}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Discrepancies Found</p>
          <p className="text-3xl font-bold">{summary.discrepancy_count}</p>
        </div>

        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Confidence</p>
          <p className="text-3xl font-bold">
            {Math.round(summary.confidence_score * 100)}%
          </p>
        </div>
      </div>
    </section>
  );
}
```

### DiscrepancyTable Component

```typescript
// marketing-tenant/src/components/audit/report/DiscrepancyTable.tsx"use client";

import { useState } from"react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from"@tanstack/react-table";
import { ArrowUpDown } from"lucide-react";
import { cn } from"@/lib/utils";
import type { Discrepancy, Severity } from"@/types/audit-report";

const SEVERITY_STYLES: Record<Severity, string> = {
  high:"bg-red-100 text-red-800",
  medium:"bg-amber-100 text-amber-800",
  low:"bg-gray-100 text-gray-800",
};

const columns: ColumnDef<Discrepancy>[] = [
  {
    accessorKey:"category",
    header: ({ column }) => (
      <button
        type="button"
        className="flex items-center gap-1"
        onClick={() => column.toggleSorting(column.getIsSorted() ==="asc")}
      >
        Category
        <ArrowUpDown className="h-3 w-3" />
      </button>
    ),
  },
  {
    accessorKey:"landlord_value",
    header:"Landlord Value",
    cell: ({ row }) => (
      <span className="font-mono">${row.original.landlord_value}</span>
    ),
  },
  {
    accessorKey:"correct_value",
    header:"Correct Value",
    cell: ({ row }) => (
      <span className="font-mono">${row.original.correct_value}</span>
    ),
  },
  {
    accessorKey:"difference_raw",
    header: ({ column }) => (
      <button
        type="button"
        className="flex items-center gap-1"
        onClick={() => column.toggleSorting(column.getIsSorted() ==="asc")}
      >
        Difference
        <ArrowUpDown className="h-3 w-3" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="font-mono font-semibold text-destructive">
        ${row.original.difference}
      </span>
    ),
  },
  {
    accessorKey:"severity",
    header: ({ column }) => (
      <button
        type="button"
        className="flex items-center gap-1"
        onClick={() => column.toggleSorting(column.getIsSorted() ==="asc")}
      >
        Severity
        <ArrowUpDown className="h-3 w-3" />
      </button>
    ),
    cell: ({ row }) => (
      <span
        className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize",
          SEVERITY_STYLES[row.original.severity],
        )}
      >
        {row.original.severity}
      </span>
    ),
  },
];

interface DiscrepancyTableProps {
  discrepancies: Discrepancy[];
}

export function DiscrepancyTable({ discrepancies }: DiscrepancyTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: discrepancies,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  if (discrepancies.length === 0) {
    return (
      <section aria-labelledby="discrepancies-heading" className="space-y-4">
        <h2 id="discrepancies-heading" className="text-xl font-bold">
          Discrepancies
        </h2>
        <div className="rounded-lg border bg-muted/50 p-8 text-center">
          <p className="text-muted-foreground">
            No discrepancies found. Your CAM charges appear to be correct.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="discrepancies-heading" className="space-y-4">
      <h2 id="discrepancies-heading" className="text-xl font-bold">
        Discrepancies ({discrepancies.length})
      </h2>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left font-medium"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

### DetailedFindings Component

```typescript
// marketing-tenant/src/components/audit/report/DetailedFindings.tsx"use client";

import { useState } from"react";
import { ChevronDown, ChevronRight } from"lucide-react";
import { cn } from"@/lib/utils";
import type { DetailedFinding, Discrepancy } from"@/types/audit-report";

interface DetailedFindingsProps {
  findings: DetailedFinding[];
  discrepancies: Discrepancy[];
}

export function DetailedFindings({
  findings,
  discrepancies,
}: DetailedFindingsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section aria-labelledby="detailed-findings-heading" className="space-y-4">
      <h2 id="detailed-findings-heading" className="text-xl font-bold">
        Detailed Findings
      </h2>

      <div className="space-y-3">
        {findings.map((finding) => {
          const discrepancy = discrepancies.find(
            (d) => d.id === finding.discrepancy_id,
          );
          const isExpanded = expandedIds.has(finding.discrepancy_id);

          return (
            <div
              key={finding.discrepancy_id}
              className="rounded-lg border"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between p-4 text-left"
                onClick={() => toggleExpanded(finding.discrepancy_id)}
                aria-expanded={isExpanded}
              >
                <span className="font-medium">
                  {discrepancy?.category ??"Finding"}
                </span>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t px-4 pb-4 pt-3 space-y-4">
                  <p className="text-sm leading-relaxed">
                    {finding.narrative}
                  </p>

                  {finding.lease_clause_reference && (
                    <div className="rounded bg-muted p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        Lease Clause Reference
                      </p>
                      <p className="mt-1 text-sm">
                        {finding.lease_clause_reference}
                      </p>
                    </div>
                  )}

                  {/* Calculation trace */}
                  {finding.calculation_trace.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium">
                        Calculation Trace
                      </p>
                      <div className="overflow-x-auto rounded border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">
                                Step
                              </th>
                              <th className="px-3 py-2 text-left font-medium">
                                Input
                              </th>
                              <th className="px-3 py-2 text-left font-medium">
                                Formula
                              </th>
                              <th className="px-3 py-2 text-left font-medium">
                                Result
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {finding.calculation_trace.map((step, idx) => (
                              <tr
                                key={idx}
                                className="border-t font-mono"
                              >
                                <td className="px-3 py-2">{step.label}</td>
                                <td className="px-3 py-2">{step.input}</td>
                                <td className="px-3 py-2">{step.formula}</td>
                                <td className="px-3 py-2 font-semibold">
                                  {step.result}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Confidence indicator */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Confidence:</span>
                    <div className="h-1.5 w-20 rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full",
                          finding.confidence >= 0.75
                            ?"bg-green-500"
                            :"bg-amber-500",
                        )}
                        style={{ width: `${finding.confidence * 100}%` }}
                      />
                    </div>
                    <span>{Math.round(finding.confidence * 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

### ReportViewer Component

```typescript
// marketing-tenant/src/components/audit/ReportViewer.tsx"use client";

import { Download } from"lucide-react";
import { Button } from"@/components/ui/button";
import { ExecutiveSummary } from"./report/ExecutiveSummary";
import { DiscrepancyTable } from"./report/DiscrepancyTable";
import { DetailedFindings } from"./report/DetailedFindings";
import { useAuditReport, useDownloadReport } from"@/hooks/use-tenant-audit";
import type { TenantAudit } from"@/types/tenant-audit";

interface ReportViewerProps {
  audit: TenantAudit;
}

export function ReportViewer({ audit }: ReportViewerProps) {
  const { data: report, isLoading, isError } = useAuditReport(
    audit.access_token,
  );

  const downloadReport = useDownloadReport(audit.access_token);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl animate-pulse space-y-6">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-32 rounded-lg bg-muted" />
        <div className="h-64 rounded-lg bg-muted" />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-xl font-bold text-destructive">
          Failed to load report
        </h2>
        <p className="mt-2 text-muted-foreground">
          Please try refreshing the page. If the problem persists, contact{""}
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

  const showDetailedSections =
    report.tier ==="detailed" || report.tier ==="expert";

  return (
    <div className="mx-auto max-w-3xl space-y-10 print:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            CAM Audit Report
          </h1>
          {audit.property_name && (
            <p className="text-muted-foreground">{audit.property_name}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Generated {new Date(report.generated_at).toLocaleDateString()}
          </p>
        </div>

        <Button
          onClick={() => downloadReport.mutate()}
          disabled={downloadReport.isPending}
          variant="outline"
          className="print:hidden"
        >
          <Download className="mr-2 h-4 w-4" />
          {downloadReport.isPending ?"Downloading..." :"Download PDF"}
        </Button>
      </div>

      {/* Executive Summary */}
      <ExecutiveSummary summary={report.executive_summary} />

      {/* Discrepancy Table */}
      <DiscrepancyTable discrepancies={report.discrepancies} />

      {/* Detailed Findings (Detailed + Expert only) */}
      {showDetailedSections && report.detailed_findings && (
        <DetailedFindings
          findings={report.detailed_findings}
          discrepancies={report.discrepancies}
        />
      )}

      {/* Next Steps */}
      <section aria-labelledby="next-steps-heading" className="space-y-4">
        <h2 id="next-steps-heading" className="text-xl font-bold">
          Recommended Next Steps
        </h2>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          {report.executive_summary.verdict ==="no_issues" ? (
            <p className="text-muted-foreground">
              Our analysis did not find significant discrepancies in your CAM
              reconciliation. Your landlord&apos;s charges appear to be in line with
              your lease terms.
            </p>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>
                <strong>Review this report carefully</strong> -- Pay attention to
                high-severity discrepancies and their lease clause references.
              </li>
              <li>
                <strong>Gather supporting documents</strong> -- Collect your
                lease, any amendments, and previous CAM reconciliation statements.
              </li>
              <li>
                <strong>Contact your landlord</strong> -- Present the
                discrepancies in writing. Reference specific lease clauses and
                calculation errors.
              </li>
              <li>
                <strong>Consider professional help</strong> -- For overcharges
                exceeding $5,000, a commercial real estate attorney or CAM
                auditor can help negotiate a recovery.
              </li>
              <li>
                <strong>Request an audit right</strong> -- Most commercial leases
                include an audit clause. Exercise it to verify the underlying
                operating expense records.
              </li>
            </ol>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t pt-4 text-center text-xs text-muted-foreground print:text-[10px]">
        <p>
          This report is generated by automated analysis and should be reviewed
          by a qualified professional before taking action. CapVeri does not
          provide legal or financial advice.
        </p>
      </footer>
    </div>
  );
}
```

### Report API Hooks

```typescript
// Additions to marketing-tenant/src/hooks/use-tenant-audit.ts

import type { AuditReport } from"@/types/audit-report";

export function useAuditReport(accessToken: string) {
  return useQuery<AuditReport>({
    queryKey: ["tenant-audit-report", accessToken],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/tenant-audits/${accessToken}/report`,
        { headers: { Accept:"application/json" } },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch report (${response.status})`);
      }

      return response.json();
    },
    staleTime: Infinity, // Report data doesn't change
  });
}

export function useDownloadReport(accessToken: string) {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/tenant-audits/${accessToken}/report`,
        { headers: { Accept:"application/pdf" } },
      );

      if (!response.ok) {
        throw new Error(`Failed to download report (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cam-audit-report-${accessToken.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}
```

## Test Cases

### ExecutiveSummary
- Renders total overcharge formatted as currency
- Renders discrepancy count
- Renders confidence score as percentage
- Shows correct verdict banner color (red for significant, amber for minor, green for none)
- Verdict label and summary text displayed

### DiscrepancyTable
- Renders all discrepancies with correct columns
- Empty state shown when no discrepancies exist
- Severity badges use correct colors (high=red, medium=amber, low=gray)
- Column sorting works for Category, Difference, and Severity
- Currency values displayed in monospace font

### DetailedFindings
- Not rendered for Standard tier
- Rendered for Detailed and Expert tiers
- Findings are expandable/collapsible
- Narrative text displayed when expanded
- Lease clause reference shown when available
- Calculation trace table rendered with steps
- Confidence bar reflects the finding's confidence score
- Low confidence findings (< 0.75) show amber bar

### ReportViewer
- Loading state shows skeleton placeholders
- Error state shows contact support message
- Download PDF button triggers file download
- Report header shows property name when available
- Report header shows generation date
- Standard tier does not show detailed findings section
- Detailed tier shows detailed findings section
- Expert tier shows detailed findings section
- Next steps section shows guidance for overcharges
- Next steps section shows"no issues" message when verdict is clean
- Disclaimer footer is visible
- Print styles applied (hidden download button, reduced spacing)

## Definition of Done
- [ ] `ExecutiveSummary` renders verdict banner, total overcharge, count, confidence
- [ ] `DiscrepancyTable` renders sortable table with severity badges
- [ ] `DiscrepancyTable` shows empty state when no discrepancies
- [ ] `DetailedFindings` renders expandable findings with narrative and calc trace
- [ ] `DetailedFindings` conditionally shown based on tier
- [ ] `ReportViewer` orchestrates all sub-components
- [ ] PDF download via `GET /api/v1/tenant-audits/{token}/report` with `Accept: application/pdf`
- [ ] JSON report fetch via same endpoint with `Accept: application/json`
- [ ] Next steps section with actionable guidance
- [ ] Loading and error states handled
- [ ] Disclaimer footer visible
- [ ] Unit tests for `ExecutiveSummary` (all verdict types)
- [ ] Unit tests for `DiscrepancyTable` (rendering, sorting, empty state)
- [ ] Unit tests for `DetailedFindings` (expand/collapse, conditional rendering)
- [ ] Unit tests for `ReportViewer` (tier-based rendering, loading, error)
- [ ] Unit tests for download hook (blob creation, file naming)
- [ ] Responsive layout verified on mobile viewport
- [ ] Print stylesheet hides interactive elements
