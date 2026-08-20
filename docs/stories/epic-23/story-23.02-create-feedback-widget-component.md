# Story 23.2: Create Feedback Widget Component

## Story Info
- **Epic**: User Feedback
- **Estimated Hours**: 3
- **Dependencies**: Epic 1 (UI Components)
- **Status**: `pending`

## User Story
**As a** user
**I want** a floating feedback button in the app
**So that** I can easily submit feedback from any page

## Acceptance Criteria
- [ ] **AC1**: Floating button positioned in bottom-right corner
- [ ] **AC2**: Clicking opens feedback dialog/sheet
- [ ] **AC3**: Type selector: Bug / Feature Request / General
- [ ] **AC4**: Message textarea with 2000 character limit
- [ ] **AC5**: Optional screenshot attachment (Story 23.3)
- [ ] **AC6**: Submit shows success toast, closes dialog
- [ ] **AC7**: Rate limit error shown clearly (429 response)

## Technical Specifications

**Feedback Widget Component**:

```tsx
// frontend/src/components/FeedbackWidget/FeedbackWidget.tsx
import { useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { FeedbackForm } from './FeedbackForm'

interface FeedbackWidgetProps {
  position?: 'bottom-right' | 'bottom-left'
}

export function FeedbackWidget({ position = 'bottom-right' }: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false)

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className={`fixed ${positionClasses[position]} z-50 h-12 w-12 rounded-full shadow-lg`}
          aria-label="Send feedback"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Send Feedback</SheetTitle>
          <SheetDescription>
            Help us improve by reporting bugs or suggesting features.
          </SheetDescription>
        </SheetHeader>
        <FeedbackForm onSuccess={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
```

**Feedback Form Component**:

```tsx
// frontend/src/components/FeedbackWidget/FeedbackForm.tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Bug, Lightbulb, MessageCircle, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { FeedbackType, FeedbackCreate } from '@/types/feedback'

interface FeedbackFormProps {
  onSuccess?: () => void
}

const feedbackTypes = [
  { value: 'bug' as const, label: 'Bug', icon: Bug },
  { value: 'feature_request' as const, label: 'Feature', icon: Lightbulb },
  { value: 'general' as const, label: 'General', icon: MessageCircle },
]

const MAX_MESSAGE_LENGTH = 2000

export function FeedbackForm({ onSuccess }: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackType>('general')
  const [message, setMessage] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (data: FeedbackCreate) => {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (res.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.')
      }

      if (!res.ok) {
        throw new Error('Failed to submit feedback')
      }

      return res.json()
    },
    onSuccess: () => {
      toast.success('Feedback submitted', {
        description: 'Thank you for helping us improve!',
      })
      setMessage('')
      setScreenshotUrl(null)
      onSuccess?.()
    },
    onError: (error: Error) => {
      toast.error('Failed to submit', {
        description: error.message,
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (message.length < 10) {
      toast.error('Message too short', {
        description: 'Please provide at least 10 characters.',
      })
      return
    }

    mutation.mutate({
      type,
      message,
      page_url: window.location.pathname,
      screenshot_url: screenshotUrl ?? undefined,
      metadata: {
        user_agent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      {/* Feedback Type Selector */}
      <div className="space-y-2">
        <Label>Type</Label>
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => v && setType(v as FeedbackType)}
          className="justify-start"
        >
          {feedbackTypes.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              className="flex items-center gap-2"
            >
              <Icon className="h-4 w-4" />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Message Input */}
      <div className="space-y-2">
        <Label htmlFor="message">
          Message
          <span className="text-muted-foreground text-sm ml-2">
            ({message.length}/{MAX_MESSAGE_LENGTH})
          </span>
        </Label>
        <Textarea
          id="message"
          placeholder={
            type === 'bug'
              ? 'Describe the bug and steps to reproduce...'
              : type === 'feature_request'
              ? 'Describe the feature you would like...'
              : 'Share your thoughts...'
          }
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          rows={5}
          required
          minLength={10}
        />
      </div>

      {/* Screenshot Preview (if captured) */}
      {screenshotUrl && (
        <div className="space-y-2">
          <Label>Screenshot</Label>
          <div className="relative">
            <img
              src={screenshotUrl}
              alt="Screenshot preview"
              className="rounded-md border max-h-40 w-full object-contain"
            />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => setScreenshotUrl(null)}
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Screenshot Capture Button (placeholder for Story 23.3) */}
      {!screenshotUrl && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            // Will be implemented in Story 23.3
            toast.info('Screenshot capture coming soon')
          }}
        >
          <Camera className="h-4 w-4 mr-2" />
          Attach Screenshot
        </Button>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={mutation.isPending || message.length < 10}
      >
        {mutation.isPending ? 'Submitting...' : 'Submit Feedback'}
      </Button>
    </form>
  )
}
```

**Widget Integration in App**:

```tsx
// frontend/src/App.tsx (add to root layout)
import { FeedbackWidget } from '@/components/FeedbackWidget/FeedbackWidget'

function App() {
  return (
    <>
      {/* ... existing app content ... */}
      <FeedbackWidget />
    </>
  )
}
```

**Export Index**:

```tsx
// frontend/src/components/FeedbackWidget/index.ts
export { FeedbackWidget } from './FeedbackWidget'
export { FeedbackForm } from './FeedbackForm'
```

## Test Cases

```tsx
// frontend/src/components/FeedbackWidget/FeedbackWidget.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedbackWidget } from './FeedbackWidget'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('FeedbackWidget', () => {
  it('renders floating button', () => {
    render(<FeedbackWidget />, { wrapper })
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeInTheDocument()
  })

  it('opens sheet when button clicked', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(screen.getByText('Send Feedback')).toBeInTheDocument()
  })

  it('shows feedback type options', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(screen.getByRole('radio', { name: /bug/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /feature/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /general/i })).toBeInTheDocument()
  })

  it('validates minimum message length', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    const submitBtn = screen.getByRole('button', { name: /submit feedback/i })

    expect(submitBtn).toBeDisabled()

    await user.type(screen.getByRole('textbox'), 'Short')
    expect(submitBtn).toBeDisabled()

    await user.type(screen.getByRole('textbox'), ' message here')
    expect(submitBtn).toBeEnabled()
  })

  it('shows character count', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    expect(screen.getByText('(0/2000)')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox'), 'Test message')
    expect(screen.getByText('(12/2000)')).toBeInTheDocument()
  })
})
```

## Definition of Done
- [ ] Floating button renders in corner
- [ ] Sheet opens/closes correctly
- [ ] Type selector works
- [ ] Message validation (10-2000 chars)
- [ ] Character count displays
- [ ] Submit calls API correctly
- [ ] Success toast and close on submit
- [ ] Rate limit error displays (429)
- [ ] Tests pass
