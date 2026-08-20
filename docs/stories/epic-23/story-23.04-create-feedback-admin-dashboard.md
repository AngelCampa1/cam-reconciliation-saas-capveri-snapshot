# Story 23.4: Create Feedback Admin Dashboard

## Story Info
- **Epic**: User Feedback
- **Estimated Hours**: 3
- **Dependencies**: Story 23.1 (Feedback Endpoints)
- **Status**: `pending`

## User Story
**As an** administrator
**I want** to view and manage user feedback
**So that** I can review bug reports and feature requests

## Acceptance Criteria
- [ ] **AC1**: Dashboard lists all feedback with pagination
- [ ] **AC2**: Filter by type (bug, feature, general)
- [ ] **AC3**: Filter by status (new, reviewed, resolved, dismissed)
- [ ] **AC4**: Click to view full feedback details
- [ ] **AC5**: Update status from detail view
- [ ] **AC6**: View attached screenshot if present
- [ ] **AC7**: Summary stats displayed (counts by type/status)

## Technical Specifications

**Feedback List Page**:

```tsx
// frontend/src/pages/admin/Feedback.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Bug, Lightbulb, MessageCircle, Image } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Feedback, FeedbackStatus, FeedbackType } from '@/types/feedback'

const typeIcons = {
  bug: Bug,
  feature_request: Lightbulb,
  general: MessageCircle,
}

const statusColors: Record<FeedbackStatus, string> = {
  new: 'bg-blue-500',
  reviewed: 'bg-yellow-500',
  resolved: 'bg-green-500',
  dismissed: 'bg-gray-500',
}

export function FeedbackPage() {
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)

  const queryClient = useQueryClient()

  // Fetch feedback list
  const { data: feedback, isLoading } = useQuery({
    queryKey: ['admin-feedback', typeFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), per_page: '20' })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/feedback?${params}`)
      return res.json() as Promise<Feedback[]>
    },
  })

  // Fetch summary stats
  const { data: stats } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: async () => {
      const res = await fetch('/api/feedback/stats/summary')
      return res.json()
    },
  })

  // Update status mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FeedbackStatus }) => {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] })
      queryClient.invalidateQueries({ queryKey: ['feedback-stats'] })
    },
  })

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feedback</h1>
        <p className="text-muted-foreground">
          Review and manage user feedback submissions
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">New</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.by_status?.new || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bugs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.by_type?.bug || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.by_type?.feature_request || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="feature_request">Feature Request</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Feedback Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Page</TableHead>
              <TableHead>Date</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : feedback?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No feedback found
                </TableCell>
              </TableRow>
            ) : (
              feedback?.map((item) => {
                const TypeIcon = typeIcons[item.type]
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4" />
                        <span className="capitalize">{item.type.replace('_', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="truncate">{item.message}</p>
                      {item.screenshot_url && (
                        <Image className="h-4 w-4 text-muted-foreground inline ml-2" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[item.status]}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.page_url || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(item.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFeedback(item)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="flex justify-center gap-2">
        <Button
          variant="outline"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={() => setPage((p) => p + 1)}
          disabled={!feedback || feedback.length < 20}
        >
          Next
        </Button>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedFeedback} onOpenChange={() => setSelectedFeedback(null)}>
        <DialogContent className="max-w-2xl">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = typeIcons[selectedFeedback.type]
                    return <Icon className="h-5 w-5" />
                  })()}
                  <span className="capitalize">
                    {selectedFeedback.type.replace('_', ' ')}
                  </span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status Update */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">Status:</span>
                  <Select
                    value={selectedFeedback.status}
                    onValueChange={(status) => {
                      updateMutation.mutate({
                        id: selectedFeedback.id,
                        status: status as FeedbackStatus,
                      })
                      setSelectedFeedback({ ...selectedFeedback, status: status as FeedbackStatus })
                    }}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Message */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Message</h4>
                  <p className="text-sm bg-muted p-4 rounded-md whitespace-pre-wrap">
                    {selectedFeedback.message}
                  </p>
                </div>

                {/* Screenshot */}
                {selectedFeedback.screenshot_url && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Screenshot</h4>
                    <img
                      src={selectedFeedback.screenshot_url}
                      alt="Feedback screenshot"
                      className="rounded-md border max-h-80 w-full object-contain bg-muted"
                    />
                  </div>
                )}

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Page URL:</span>
                    <p className="text-muted-foreground">{selectedFeedback.page_url || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="font-medium">Submitted:</span>
                    <p className="text-muted-foreground">
                      {format(new Date(selectedFeedback.created_at), 'PPpp')}
                    </p>
                  </div>
                </div>

                {selectedFeedback.metadata && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Context</h4>
                    <pre className="text-xs bg-muted p-2 rounded-md overflow-auto">
                      {JSON.stringify(selectedFeedback.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

**Route Registration**:

```tsx
// frontend/src/App.tsx (add to routes)
import { FeedbackPage } from '@/pages/admin/Feedback'

// In router config
<Route path="/admin/feedback" element={<FeedbackPage />} />
```

**Navigation Link**:

```tsx
// frontend/src/components/AdminNav.tsx (add link)
<NavLink to="/admin/feedback">
  <MessageSquarePlus className="h-4 w-4" />
  Feedback
</NavLink>
```

## Test Cases

```tsx
// frontend/src/pages/admin/Feedback.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedbackPage } from './Feedback'

const mockFeedback = [
  {
    id: '1',
    user_id: 'user-1',
    organization_id: 'org-1',
    type: 'bug',
    status: 'new',
    message: 'The button does not work when clicked',
    page_url: '/dashboard',
    screenshot_url: null,
    metadata: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
]

const mockStats = {
  total: 5,
  by_type: { bug: 2, feature_request: 2, general: 1 },
  by_status: { new: 3, reviewed: 1, resolved: 1, dismissed: 0 },
}

global.fetch = jest.fn((url) => {
  if (url.includes('/stats')) {
    return Promise.resolve({ json: () => Promise.resolve(mockStats) })
  }
  return Promise.resolve({ json: () => Promise.resolve(mockFeedback) })
}) as jest.Mock

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('FeedbackPage', () => {
  beforeEach(() => {
    queryClient.clear()
  })

  it('renders feedback list', async () => {
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('The button does not work when clicked')).toBeInTheDocument()
    })
  })

  it('shows summary stats', async () => {
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument() // Total
      expect(screen.getByText('3')).toBeInTheDocument() // New
    })
  })

  it('opens detail dialog when clicking view', async () => {
    const user = userEvent.setup()
    render(<FeedbackPage />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('View')).toBeInTheDocument()
    })

    await user.click(screen.getByText('View'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('/dashboard')).toBeInTheDocument()
  })

  it('filters by type', async () => {
    const user = userEvent.setup()
    render(<FeedbackPage />, { wrapper })

    await user.click(screen.getByRole('combobox', { name: /all types/i }))
    await user.click(screen.getByRole('option', { name: /bug/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('type=bug'))
    })
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    render(<FeedbackPage />, { wrapper })

    await user.click(screen.getByRole('combobox', { name: /all statuses/i }))
    await user.click(screen.getByRole('option', { name: /new/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('status=new'))
    })
  })
})
```

```python
# backend/tests/test_feedback_admin.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_feedback_admin_only(
    async_client: AsyncClient,
    user_headers: dict,
    admin_headers: dict,
):
    """Verify list endpoint is admin-only."""
    # Regular user should be rejected
    response = await async_client.get("/api/feedback", headers=user_headers)
    assert response.status_code == 403

    # Admin should succeed
    response = await async_client.get("/api/feedback", headers=admin_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_list_feedback_with_filters(
    async_client: AsyncClient,
    admin_headers: dict,
    sample_feedback: list,
):
    """Verify filters work correctly."""
    # Filter by type
    response = await async_client.get(
        "/api/feedback?type=bug",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert all(f["type"] == "bug" for f in data)

    # Filter by status
    response = await async_client.get(
        "/api/feedback?status=new",
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert all(f["status"] == "new" for f in data)


@pytest.mark.asyncio
async def test_update_feedback_status(
    async_client: AsyncClient,
    admin_headers: dict,
    sample_feedback: list,
):
    """Verify status update works."""
    feedback_id = sample_feedback[0]["id"]

    response = await async_client.patch(
        f"/api/feedback/{feedback_id}",
        json={"status": "reviewed"},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "reviewed"


@pytest.mark.asyncio
async def test_feedback_stats(
    async_client: AsyncClient,
    admin_headers: dict,
):
    """Verify stats endpoint returns correct structure."""
    response = await async_client.get(
        "/api/feedback/stats/summary",
        headers=admin_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "by_type" in data
    assert "by_status" in data
```

## Definition of Done
- [ ] Admin feedback list page renders
- [ ] Type filter works
- [ ] Status filter works
- [ ] Pagination works
- [ ] Detail dialog opens
- [ ] Status update works from dialog
- [ ] Screenshot displays in detail view
- [ ] Summary stats display
- [ ] Admin-only access enforced
- [ ] Tests pass
