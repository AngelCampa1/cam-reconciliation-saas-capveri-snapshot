import { Link } from 'react-router-dom'

import { publicKnowledge } from '@/generated/public-knowledge'
import { SEO } from '@/components/SEO'
import { Button } from '@/components/ui/button'

const aiClaim = publicKnowledge.claims.byId['ai-human-reviewed']
const deterministicClaim =
  publicKnowledge.claims.byId['deterministic-financial-math']
const securityContact = publicKnowledge.contacts.byId.security
const supportContact = publicKnowledge.contacts.byId.support

export function AiTransparencyPage() {
  return (
    <>
      <SEO
        title="AI Transparency Statement"
        description="How CapVeri uses AI assistance alongside deterministic CAM reconciliation calculations and human review."
      />
      <div className="min-h-screen bg-background">
        {/* App.tsx renders the single <main id="main-content"> landmark; this is a layout div only. */}
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-muted-foreground">
            Compliance
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            AI Transparency Statement
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            CapVeri uses AI assistance for document understanding, while CAM
            calculations stay deterministic and reviewable.
          </p>

          <section className="mt-10 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Where AI Helps
              </h2>
              <p className="mt-2 text-muted-foreground">
                {aiClaim?.wording ??
                  'AI helps extract lease terms, and users review extracted terms before they are used in reconciliation workflows.'}
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Where Deterministic Math Applies
              </h2>
              <p className="mt-2 text-muted-foreground">
                {deterministicClaim?.wording ??
                  'CapVeri uses deterministic calculation logic for financial math so reconciliation outputs can be reviewed step by step.'}
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Human Review
              </h2>
              <p className="mt-2 text-muted-foreground">
                Users are responsible for reviewing extracted terms, uploaded
                data, and reconciliation outputs before relying on them for
                tenant communications or legal/compliance decisions.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Questions
              </h2>
              <p className="mt-2 text-muted-foreground">
                {securityContact.email === supportContact.email ? (
                  <>
                    Contact{' '}
                    <a
                      href={supportContact.mailto}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {supportContact.email}
                    </a>{' '}
                    with security or product questions.
                  </>
                ) : (
                  <>
                    Contact{' '}
                    <a
                      href={securityContact.mailto}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {securityContact.email}
                    </a>{' '}
                    for security questions or{' '}
                    <a
                      href={supportContact.mailto}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {supportContact.email}
                    </a>{' '}
                    for product support.
                  </>
                )}
              </p>
            </div>
          </section>

          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/contact">Contact CapVeri</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/privacy">Privacy Policy</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
