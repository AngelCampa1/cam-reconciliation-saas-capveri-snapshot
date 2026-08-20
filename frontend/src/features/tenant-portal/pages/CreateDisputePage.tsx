/**
 * Create Dispute Page
 *
 * Allows tenants to submit a new dispute for a reconciliation statement.
 * Integrates with existing DisputeForm component.
 */
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { DisputeForm } from '../components/DisputeForm'
import { PageHeader, PageContainer } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'

export function CreateDisputePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const statementId = searchParams.get('statement_id')

  if (!statementId) {
    return (
      <PageContainer>
        <PageHeader
          title="Submit Dispute"
          description="Create a new dispute for a reconciliation statement"
          showBackButton={true}
          backButtonTo="/tenant/disputes"
        />
        <div className="p-6">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
            <FileText
              className="h-8 w-8 text-muted-foreground/60"
              aria-hidden="true"
            />
            <p className="font-medium">Pick a statement first</p>
            <p className="text-sm text-muted-foreground">
              Open a statement on your dashboard and choose Dispute. That ties
              your question to the exact charges.
            </p>
            <Button onClick={() => navigate('/tenant/dashboard')}>
              Go to your dashboard
            </Button>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Submit Dispute"
        description="Describe the issue with your CAM reconciliation statement"
        showBackButton={true}
        backButtonTo="/tenant/disputes"
      />
      <div className="flex-1 p-6">
        <Card className="mx-auto max-w-2xl">
          <CardContent className="pt-6">
            <DisputeForm
              statementId={statementId}
              onSuccess={() => navigate('/tenant/disputes')}
              onCancel={() => navigate('/tenant/disputes')}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
