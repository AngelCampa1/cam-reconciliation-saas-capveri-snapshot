export interface QuizAnswer {
  label: string;
  points: 0 | 5 | 10;
  vulnerabilityLabel?: string;
}

export interface QuizQuestion {
  id: number;
  topic: string;
  question: string;
  answers: [QuizAnswer, QuizAnswer, QuizAnswer];
}

export interface RiskTier {
  label: "Low Risk" | "Moderate Risk" | "High Risk";
  message: string;
  color: string;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    topic: "Expense Classification",
    question:
      "How do you classify borderline capital vs. operating expenses in your CAM pool?",
    answers: [
      {
        label: "Written policy applied consistently across all properties",
        points: 0,
      },
      {
        label: "General accounting rules, reviewed case by case",
        points: 5,
        vulnerabilityLabel: "Expense pool integrity gap",
      },
      {
        label: "We include what the lease allows - no written policy",
        points: 10,
        vulnerabilityLabel: "Expense pool integrity gap",
      },
    ],
  },
  {
    id: 2,
    topic: "Gross-Up Methodology",
    question:
      "Do you have a written gross-up methodology document for occupancy adjustments?",
    answers: [
      {
        label: "Yes - documented and reviewed with legal counsel",
        points: 0,
      },
      {
        label: "Yes - in a spreadsheet but no formal written policy",
        points: 5,
        vulnerabilityLabel: "Gross-up methodology undocumented",
      },
      {
        label: "No - we gross up based on standard practice",
        points: 10,
        vulnerabilityLabel: "Gross-up methodology undocumented",
      },
    ],
  },
  {
    id: 3,
    topic: "CAM Cap Tracking",
    question:
      "How do you track cumulative CAM caps (controllable/non-controllable) by tenant?",
    answers: [
      {
        label: "Automated system with year-over-year tracking per tenant",
        points: 0,
      },
      {
        label: "Spreadsheet-based with manual verification at reconciliation",
        points: 5,
        vulnerabilityLabel: "CAM cap / base year records missing",
      },
      {
        label: "We don't track caps separately - reconciliation is manual",
        points: 10,
        vulnerabilityLabel: "CAM cap / base year records missing",
      },
    ],
  },
  {
    id: 4,
    topic: "Base Year Documentation",
    question:
      "Do you maintain auditable records of your base year expenses with original source documents?",
    answers: [
      {
        label: "Yes - invoices and GL detail archived with version control",
        points: 0,
      },
      {
        label: "Yes - but primarily summary-level reconciliation reports",
        points: 5,
        vulnerabilityLabel: "CAM cap / base year records missing",
      },
      {
        label:
          "Base year records are difficult to reconstruct from current systems",
        points: 10,
        vulnerabilityLabel: "CAM cap / base year records missing",
      },
    ],
  },
  {
    id: 5,
    topic: "Reconciliation Review",
    question:
      "Before sending CAM reconciliation statements to tenants, how many independent reviews occur?",
    answers: [
      {
        label: "Two or more, including a controller-level sign-off",
        points: 0,
      },
      {
        label: "One review by the preparer or property manager",
        points: 5,
        vulnerabilityLabel: "No independent reconciliation review",
      },
      {
        label: "No formal review - statements go out when complete",
        points: 10,
        vulnerabilityLabel: "No independent reconciliation review",
      },
    ],
  },
  {
    id: 6,
    topic: "Tenant Dispute History",
    question:
      "Has any tenant formally disputed a CAM reconciliation statement in the last 3 years?",
    answers: [
      {
        label: "No disputes of any kind",
        points: 0,
      },
      {
        label: "1–2 informal challenges resolved without formal audits",
        points: 5,
        vulnerabilityLabel: "Audit trail incomplete",
      },
      {
        label: "One or more formal audits or written dispute letters",
        points: 10,
        vulnerabilityLabel: "Audit trail incomplete",
      },
    ],
  },
  {
    id: 7,
    topic: "Expense Variance Analysis",
    question:
      "Do you perform year-over-year variance analysis on your CAM expense pools before reconciliation?",
    answers: [
      {
        label: "Yes - with documented explanations for any variance over 5%",
        points: 0,
      },
      {
        label: "Informally, but explanations are not documented",
        points: 5,
        vulnerabilityLabel: "No independent reconciliation review",
      },
      {
        label: "No systematic variance review before reconciliation",
        points: 10,
        vulnerabilityLabel: "No independent reconciliation review",
      },
    ],
  },
  {
    id: 8,
    topic: "Occupancy Tracking",
    question:
      "How do you track occupancy levels when applying gross-up to variable expenses?",
    answers: [
      {
        label: "Certified monthly occupancy reports by floor/section",
        points: 0,
      },
      {
        label: "Annual average derived from lease abstracts",
        points: 5,
        vulnerabilityLabel: "Gross-up methodology undocumented",
      },
      {
        label: "Standard assumption - no per-period occupancy tracking",
        points: 10,
        vulnerabilityLabel: "Gross-up methodology undocumented",
      },
    ],
  },
  {
    id: 9,
    topic: "Exclusion Compliance",
    question:
      "Do you systematically verify that tenant-specific CAM exclusions are removed from the expense pool?",
    answers: [
      {
        label: "Yes - automated exception reporting flags excluded charges",
        points: 0,
      },
      {
        label: "Manual checklist reviewed at reconciliation time",
        points: 5,
        vulnerabilityLabel: "Expense pool integrity gap",
      },
      {
        label:
          "Exclusions tracked in lease notes but no systematic removal check",
        points: 10,
        vulnerabilityLabel: "Expense pool integrity gap",
      },
    ],
  },
  {
    id: 10,
    topic: "Audit Trail Readiness",
    question:
      "If a tenant auditor requested supporting documentation today, how quickly could you produce it?",
    answers: [
      {
        label: "Under 48 hours - invoices and GL detail are indexed",
        points: 0,
      },
      {
        label: "1–2 weeks - requires pulling from multiple systems",
        points: 5,
        vulnerabilityLabel: "Audit trail incomplete",
      },
      {
        label: "More than 2 weeks or documentation is incomplete",
        points: 10,
        vulnerabilityLabel: "Audit trail incomplete",
      },
    ],
  },
];

export const RISK_TIERS: { low: RiskTier; moderate: RiskTier; high: RiskTier } =
  {
    low: {
      label: "Low Risk",
      message: "Your processes are solid.",
      color: "text-success-strong",
    },
    moderate: {
      label: "Moderate Risk",
      message: "You have 2–3 exploitable gaps.",
      color: "text-warning",
    },
    high: {
      label: "High Risk",
      message: "A tenant auditor would likely find chargeable errors here.",
      color: "text-destructive-strong",
    },
  };

export const VULNERABILITY_MAP: Record<string, string> = {
  "Expense pool integrity gap":
    "Inconsistent expense classification gives auditors grounds to challenge inclusions.",
  "Gross-up methodology undocumented":
    "Undocumented gross-up creates liability when occupancy assumptions are questioned.",
  "CAM cap / base year records missing":
    "Missing historical records make it impossible to defend cap calculations.",
  "No independent reconciliation review":
    "A missing second review lets billing errors slip through.",
  "Audit trail incomplete":
    "Slow or incomplete document production triggers deeper audit scrutiny.",
};

export function computeScore(answers: number[]): number {
  return answers.reduce((sum, pts) => sum + pts, 0);
}

export function getTier(score: number): RiskTier {
  if (score <= 30) return RISK_TIERS.low;
  if (score <= 65) return RISK_TIERS.moderate;
  return RISK_TIERS.high;
}

export function getTopVulnerabilities(answers: number[]): string[] {
  const scored = QUIZ_QUESTIONS.map((q, i) => {
    const pts = answers[i] ?? 0;
    const selectedAnswer = q.answers.find((a) => a.points === pts);
    return {
      points: pts,
      label: selectedAnswer?.vulnerabilityLabel ?? null,
    };
  })
    .filter(
      (item): item is { points: number; label: string } =>
        item.points > 0 && item.label !== null,
    )
    .sort((a, b) => b.points - a.points);

  // Only return vulnerabilities the user's own answers actually triggered.
  // Never pad to a fixed count from the full map: showing gaps the user did
  // not surface would misrepresent their result and erode trust.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of scored) {
    if (!seen.has(item.label)) {
      seen.add(item.label);
      result.push(item.label);
    }
    if (result.length === 3) break;
  }

  return result;
}
