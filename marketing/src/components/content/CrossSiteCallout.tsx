import { ArrowUpRight } from "lucide-react";

const CAMAUDIT_START_URL = "https://www.camaudit.io";

export function CrossSiteCallout() {
  return (
    <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
      <p className="text-sm font-semibold text-foreground mb-1">
        Need lease data before you reconcile?
      </p>
      <p className="text-base sm:text-sm text-muted-foreground mb-3">
        <strong className="text-foreground">lextract.io</strong> abstracts
        commercial leases into 126 structured fields in minutes - CAM
        definitions, pro-rata share, caps, base year, and more. No manual data
        entry.
      </p>
      <a
        href="https://www.lextract.io"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center gap-1 text-base sm:text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/70 transition-colors duration-200"
      >
        Go to lextract.io
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

export function CrossSiteCalloutCamAudit() {
  return (
    <div className="not-prose rounded-lg border bg-muted/30 p-5 mb-8">
      <p className="text-sm font-semibold text-foreground mb-1">
        Need to verify your landlord&apos;s CAM charges?
      </p>
      <p className="text-base sm:text-sm text-muted-foreground mb-3">
        <strong className="text-foreground">CAMAudit.io</strong> runs a 14-rule
        forensic scan on your reconciliation statement and identifies potential
        overcharges in minutes.
      </p>
      <a
        href={CAMAUDIT_START_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center gap-1 text-base sm:text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/70 transition-colors duration-200"
      >
        Start forensic review
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

export function TenantAudienceBanner() {
  return (
    <div className="not-prose rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6 flex items-start gap-3">
      <span className="text-base sm:text-sm text-muted-foreground">
        <strong className="text-foreground">
          Are you a commercial tenant?
        </strong>{" "}
        <a
          href={CAMAUDIT_START_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors duration-200"
        >
          Start a forensic review of your CAM statement
        </a>
      </span>
    </div>
  );
}
