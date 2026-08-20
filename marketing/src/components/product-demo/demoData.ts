export type DemoStatus = "ready" | "review" | "blocked" | "complete";

export interface DemoMetric {
  label: string;
  value: string;
  detail: string;
  status: DemoStatus;
}

export interface DemoReconciliationRow {
  property: string;
  period: string;
  recoverable: string;
  billed: string;
  variance: string;
  status: DemoStatus;
}

export interface DemoLeaseRule {
  tenant: string;
  rule: string;
  source: string;
  confidence: string;
  status: DemoStatus;
}

export interface DemoException {
  title: string;
  owner: string;
  amount: string;
  age: string;
  status: DemoStatus;
}

export interface DemoPacketItem {
  label: string;
  detail: string;
  status: DemoStatus;
}

export const reconciliationMetrics: DemoMetric[] = [
  {
    label: "Recovery variance",
    value: "$18,420",
    detail: "3.1% above estimate",
    status: "review",
  },
  {
    label: "Lease rules mapped",
    value: "94%",
    detail: "46 of 49 suites",
    status: "ready",
  },
  {
    label: "Exceptions open",
    value: "7",
    detail: "2 require controller review",
    status: "blocked",
  },
];

export const reconciliationRows: DemoReconciliationRow[] = [
  {
    property: "Northline Plaza",
    period: "2025 CAM",
    recoverable: "$612,880",
    billed: "$594,460",
    variance: "$18,420",
    status: "review",
  },
  {
    property: "Harbor Retail Center",
    period: "2025 CAM",
    recoverable: "$438,210",
    billed: "$439,005",
    variance: "-$795",
    status: "ready",
  },
  {
    property: "Cedar Logistics Park",
    period: "2025 CAM",
    recoverable: "$1,204,300",
    billed: "$1,188,100",
    variance: "$16,200",
    status: "blocked",
  },
];

export const leaseRules: DemoLeaseRule[] = [
  {
    tenant: "Suite 104",
    rule: "Admin fee capped at 5%",
    source: "Lease abstract page 18",
    confidence: "Verified",
    status: "complete",
  },
  {
    tenant: "Suite 220",
    rule: "Excludes capital repairs",
    source: "CAM exhibit B",
    confidence: "Needs review",
    status: "review",
  },
  {
    tenant: "Suite 310",
    rule: "Pro rata by occupied GLA",
    source: "Rent roll + lease",
    confidence: "Verified",
    status: "ready",
  },
];

export const exceptions: DemoException[] = [
  {
    title: "Insurance recovery exceeds cap",
    owner: "Controller",
    amount: "$4,880",
    age: "2 days",
    status: "review",
  },
  {
    title: "Missing snow removal invoice",
    owner: "Property manager",
    amount: "$1,240",
    age: "5 days",
    status: "blocked",
  },
  {
    title: "Tenant exclusion requires support",
    owner: "Lease admin",
    amount: "$9,600",
    age: "1 day",
    status: "ready",
  },
];

export const auditPacketItems: DemoPacketItem[] = [
  {
    label: "Tenant statement",
    detail: "Suite-level charges and credits",
    status: "complete",
  },
  {
    label: "Calculation workbook",
    detail: "Deterministic CAM math trail",
    status: "complete",
  },
  {
    label: "Source support",
    detail: "GL, lease rules, and exception notes",
    status: "review",
  },
];

export const statusLabels: Record<DemoStatus, string> = {
  ready: "Ready",
  review: "Review",
  blocked: "Needs input",
  complete: "Complete",
};
