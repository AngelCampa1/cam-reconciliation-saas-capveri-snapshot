import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolPageLayout } from '@/components/content/ToolPageLayout'
import { trackEvent } from '@/lib/analytics'
import {
  QUIZ_QUESTIONS,
  computeScore,
  getTier,
  getTopVulnerabilities,
  VULNERABILITY_MAP,
} from './quiz-data'

const TOTAL = QUIZ_QUESTIONS.length

const TIER_ICONS = {
  'Low Risk': ShieldCheck,
  'Moderate Risk': ShieldAlert,
  'High Risk': ShieldX,
}

export function AuditRiskQuizPage() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(TOTAL).fill(null)
  )
  const [showResults, setShowResults] = useState(false)

  const currentQuestion = QUIZ_QUESTIONS[step]
  const selectedAnswer = answers[step]
  const isLastQuestion = step === TOTAL - 1

  function handleSelectAnswer(points: number) {
    setAnswers((prev) => {
      const next = [...prev]
      next[step] = points
      return next
    })
  }

  function handleNext() {
    if (isLastQuestion) {
      setShowResults(true)
      window.scrollTo({ top: 0 })
    } else {
      setStep((s) => s + 1)
      window.scrollTo({ top: 0 })
    }
  }

  function handleBack() {
    setStep((s) => s - 1)
  }

  useEffect(() => {
    if (!showResults) return
    const score = computeScore(answers as number[])
    const tier = getTier(score)
    trackEvent('tool_interaction', {
      slug: 'audit-risk-quiz',
      result_summary: tier.label,
    })
  }, [showResults]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentQuestion) return null

  if (showResults) {
    const score = computeScore(answers as number[])
    const tier = getTier(score)
    const vulns = getTopVulnerabilities(answers as number[])
    const TierIcon = TIER_ICONS[tier.label]

    return (
      <ToolPageLayout
        title="CAM Audit Risk Score"
        description="Find out how vulnerable your CAM reconciliation process is to a tenant audit."
        canonical="/tools/audit-risk-quiz"
        toolName="CAM Audit Risk Score"
      >
        <div className="bg-card border rounded-xl p-8 shadow-sm">
          <h1 className="text-2xl font-bold mb-1 text-center">
            Your Audit Risk Score
          </h1>
          <p className="text-center text-muted-foreground mb-8 text-sm">
            Based on your answers across 10 risk categories
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
              See what CapVeri checks in your files, not just a score.
            </p>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/auth/register">
                Start a free reconciliation setup
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 text-sm text-center">
            <Button asChild variant="outline" className="flex-1">
              <Link to="/resources/tenant-auditor-guide">
                What Tenant Auditors Look For →
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link to="/resources/cam-presend-checklist">
                CAM Pre-Send Checklist →
              </Link>
            </Button>
          </div>
        </div>
      </ToolPageLayout>
    )
  }

  return (
    <ToolPageLayout
      title="CAM Audit Risk Score"
      description="Find out how vulnerable your CAM reconciliation process is to a tenant audit. 10 questions, instant results."
      canonical="/tools/audit-risk-quiz"
      toolName="CAM Audit Risk Score"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">CAM Audit Risk Score</h1>
        <p className="text-muted-foreground">
          10 questions · 2 minutes · Instant results
        </p>
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
                  ? 'bg-primary'
                  : i === step
                    ? 'bg-primary/60'
                    : 'bg-muted'
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
            const isSelected = selectedAnswer === answer.points
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectAnswer(answer.points)}
                className={`w-full text-left px-4 py-3.5 rounded-full border text-sm transition-colors duration-200 ${
                  isSelected
                    ? 'border-primary bg-primary/5 text-foreground font-medium'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-accent hover:text-foreground'
                }`}
              >
                {answer.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        {step > 0 ? (
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        ) : (
          <div />
        )}
        <Button onClick={handleNext} disabled={selectedAnswer === null}>
          {isLastQuestion ? 'See My Results' : 'Next'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </ToolPageLayout>
  )
}
