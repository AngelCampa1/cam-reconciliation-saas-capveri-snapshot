"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ArrowLeft,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";
import {
  QUIZ_QUESTIONS,
  computeScore,
  getTier,
  getTopVulnerabilities,
  VULNERABILITY_MAP,
} from "./quiz-data";

const AUDIT_RISK_FAQS = [
  {
    question: "What triggers a tenant CAM audit?",
    answer:
      "Common triggers include year-over-year expense increases above 5 to 10%, new property management, lease renewal talks, and tenant complaints about billing. Larger tenants with audit rights are more likely to use them.",
  },
  {
    question: "How much does a tenant CAM audit cost the landlord?",
    answer:
      "Direct costs include staff time to compile records (typically 20 to 40 hours per audit), legal review if disputes grow, and refunds if errors are found. Tenant auditors usually work on 15 to 33% contingency, so they keep a share of any overcharges they find.",
  },
  {
    question: "Can landlords prevent tenant CAM audits?",
    answer:
      "Landlords cannot stop audits when the lease grants audit rights. But proactive reconciliation cuts audit risk. Catching errors before the tenant's auditor does removes the contingency fee and shows good-faith billing.",
  },
  {
    question: "What is a CAM audit right clause?",
    answer:
      "A CAM audit right clause is a lease term that lets tenants inspect the landlord's books for operating expenses. Most commercial leases include one, with a 12 to 24 month lookback window and rules for CPA-conducted reviews.",
  },
];

const faqSchema = structuredDataSchemas.faqPage(AUDIT_RISK_FAQS);

const TOTAL = QUIZ_QUESTIONS.length;

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    applicationCategory: "FinanceApplication",
    applicationSubCategory: "Assessment Tool",
    name: "CAM Audit Risk Score Quiz",
    description:
      "See how exposed your CAM reconciliation process is to a tenant audit. 10 questions across gross-up, caps, exclusions, and more.",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: buildSiteUrl("/tools/audit-risk-quiz"),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Check Your CAM Audit Risk",
    description:
      "Take the free 10-question CAM Audit Risk Score quiz to find weak spots in your reconciliation process.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Start the quiz",
        text: "Open the CAM Audit Risk Score quiz. No login or email required.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Answer 10 risk questions",
        text: "Answer questions about your gross-up methodology, CAM caps, expense exclusions, reconciliation frequency, and audit trail practices.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Review your risk score",
        text: "Receive an instant risk score (Low, Moderate, or High) with your top vulnerabilities identified.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Act on your findings",
        text: "Use the identified weak spots to fix issues or start a free trial with your actual GL data.",
      },
    ],
  },
];

const TIER_ICONS = {
  "Low Risk": ShieldCheck,
  "Moderate Risk": ShieldAlert,
  "High Risk": ShieldX,
};

export function AuditRiskQuizPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(TOTAL).fill(null),
  );
  const [showResults, setShowResults] = useState(false);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the results heading when the score screen mounts so screen
  // readers announce the new screen (the Next button they activated is gone).
  useEffect(() => {
    if (showResults) {
      resultsHeadingRef.current?.focus();
    }
  }, [showResults]);

  const currentQuestion = QUIZ_QUESTIONS[step];
  const selectedAnswer = answers[step];
  const isLastQuestion = step === TOTAL - 1;

  function handleSelectAnswer(points: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[step] = points;
      return next;
    });
  }

  function handleNext() {
    if (isLastQuestion) {
      setShowResults(true);
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  function handleRetake() {
    setStep(0);
    setAnswers(Array(TOTAL).fill(null));
    setShowResults(false);
  }

  if (!currentQuestion) return null;

  if (showResults) {
    const score = computeScore(answers as number[]);
    const tier = getTier(score);
    const vulns = getTopVulnerabilities(answers as number[]);
    const TierIcon = TIER_ICONS[tier.label];

    return (
      <ToolPageLayout
        title="CAM Audit Risk Score"
        description="Find out how exposed your CAM reconciliation process is to a tenant audit."
        canonical="/tools/audit-risk-quiz"
        toolName="CAM Audit Risk Score"
        structuredData={[...STRUCTURED_DATA, faqSchema]}
      >
        <div className="bg-card border rounded-xl p-8 shadow-sm">
          <h1
            ref={resultsHeadingRef}
            tabIndex={-1}
            className="text-2xl font-bold mb-1 text-center outline-none"
          >
            Your Audit Risk Score
          </h1>
          <p className="text-center text-muted-foreground mb-8 text-sm">
            Based on your answers to 10 risk categories
          </p>

          <div className="flex flex-col items-center gap-2 mb-8">
            <div
              className={`text-6xl font-extrabold tabular-nums ${tier.color}`}
            >
              {score}
            </div>
            <div className="flex items-center gap-2">
              <TierIcon className={`w-5 h-5 ${tier.color}`} />
              <span className={`text-xl font-semibold ${tier.color}`}>
                {tier.label}
              </span>
            </div>
            <p className="text-muted-foreground text-center mt-1">
              {tier.message}
            </p>
          </div>

          {score > 0 && (
            <div className="mb-8">
              <h2 className="text-base font-semibold mb-3">
                Top Vulnerabilities Identified
              </h2>
              <ul className="space-y-3">
                {vulns.map((label) => (
                  <li
                    key={label}
                    className="flex gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-lg"
                  >
                    <ShieldAlert className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-sm text-muted-foreground">
                        {VULNERABILITY_MAP[label]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center mb-6">
            <p className="text-sm font-medium mb-3">
              See real findings in your actual GL, not just a score.
            </p>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={`${buildTrialLink({ content: "u_cta" })}`}>
                Start a free trial with your actual GL
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 text-sm text-center">
            <Link
              href="/resources/tenant-cam-audit-landlord-side"
              className="flex-1 p-3 border rounded-full hover:bg-accent transition-colors duration-200 text-muted-foreground hover:text-foreground"
            >
              What Tenant Auditors Look For →
            </Link>
            <Link
              href="/resources/cam-pre-send-packet-checklist"
              className="flex-1 p-3 border rounded-full hover:bg-accent transition-colors duration-200 text-muted-foreground hover:text-foreground"
            >
              CAM Pre-Send Checklist →
            </Link>
          </div>

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              onClick={handleRetake}
              className="min-h-[44px] text-muted-foreground"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Start over
            </Button>
          </div>
        </div>
      </ToolPageLayout>
    );
  }

  return (
    <ToolPageLayout
      title="CAM Audit Risk Score"
      description="Find out how exposed your CAM reconciliation process is to a tenant audit. 10 questions, instant results."
      canonical="/tools/audit-risk-quiz"
      toolName="CAM Audit Risk Score"
      structuredData={STRUCTURED_DATA}
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {`Question ${step + 1} of ${TOTAL}: ${currentQuestion.question}`}
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">CAM Audit Risk Score</h1>
        <p className="text-muted-foreground">
          10 questions · 2 minutes · Instant results
        </p>
        <div className="mt-6 max-w-2xl text-left text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
          <p>
            <strong>
              This quiz scores your portfolio's exposure to tenant audit
              challenges. It looks at reconciliation frequency, gross-up
              tracking, lease abstract completeness, and error history.
            </strong>{" "}
            Higher-risk buildings should be reviewed first.
          </p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground font-medium">
            Question {step + 1} of {TOTAL}
          </span>
          <span className="text-muted-foreground">{currentQuestion.topic}</span>
        </div>
        <div className="flex gap-1.5">
          {QUIZ_QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                i < step
                  ? "bg-primary"
                  : i === step
                    ? "bg-primary/60"
                    : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-lg font-semibold mb-6 leading-snug">
          {currentQuestion.question}
        </h2>

        <div className="space-y-3">
          {currentQuestion.answers.map((answer, idx) => {
            const isSelected = selectedAnswer === answer.points;
            return (
              <button
                key={idx}
                onClick={() => handleSelectAnswer(answer.points)}
                aria-pressed={isSelected}
                className={`w-full text-left px-5 py-3.5 rounded-full border text-sm transition-colors duration-200 ${
                  isSelected
                    ? "border-primary bg-primary/5 text-foreground font-medium"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-accent hover:text-foreground"
                }`}
              >
                {answer.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        {step > 0 ? (
          <Button
            variant="outline"
            onClick={handleBack}
            className="min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        ) : (
          <div />
        )}
        <Button
          onClick={handleNext}
          disabled={selectedAnswer === null}
          className="min-h-[44px]"
        >
          {isLastQuestion ? "See My Results" : "Next"}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* FAQ Section */}
      <section className="mt-10">
        <h2 className="text-lg md:text-xl lg:text-2xl font-bold mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {AUDIT_RISK_FAQS.map((faq) => (
            <details key={faq.question} className="group border rounded-lg">
              <summary className="flex cursor-pointer select-none items-center justify-between p-4 font-medium">
                {faq.question}
                <ChevronDown
                  className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="px-4 pb-4 text-muted-foreground text-sm leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </section>
    </ToolPageLayout>
  );
}
