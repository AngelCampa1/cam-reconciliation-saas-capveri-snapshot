import { Receipt, FileText, MessageSquareWarning } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

const tenantGuides = [
  {
    title: 'Open your statement PDF',
    icon: FileText,
    steps: [
      'Go to Dashboard and find the statement for your lease or suite.',
      'Choose Download PDF. Your browser may open it in a new tab or save it to Downloads.',
      'If you cannot find it, check the Downloads folder for the newest PDF file.',
    ],
  },
  {
    title: 'Read the charge summary',
    icon: Receipt,
    steps: [
      'Start with the total amount due and the billing period.',
      'Review the expense categories and your share of each category.',
      'If a number looks wrong, note the category, amount, and page before opening a dispute.',
    ],
  },
  {
    title: 'Ask a question or dispute a charge',
    icon: MessageSquareWarning,
    steps: [
      'Open the statement from your dashboard and choose the dispute option.',
      'Write a plain description of what looks wrong. Mention the charge, period, and supporting detail.',
      'Watch Disputes for updates. Your property team can respond there.',
    ],
  },
]

export function TenantHelpPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Tenant Help"
        description="Plain-language help for statements, PDFs, charges, and disputes."
      />

      <div className="space-y-6">
        <section className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          <h2 className="text-lg font-semibold text-foreground">
            If you are not sure where to start
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Start on your dashboard. It lists the statements available to you. A
            statement PDF is the printable report that explains the charges. You
            can ask a question by opening a dispute tied to that statement.
          </p>
          <Button asChild className="mt-4">
            <Link to="/tenant/dashboard">Go to tenant dashboard</Link>
          </Button>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          {tenantGuides.map((guide) => {
            const Icon = guide.icon
            return (
              <Card key={guide.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    {guide.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    {guide.steps.map((step, index) => (
                      <li key={step} className="flex gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </PageContainer>
  )
}
