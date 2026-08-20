import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Bug, Lightbulb, MessageCircle, Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture'
import { getSession } from '@/api/client'
import { resolveApiUrl } from '@/api/url'
import { trackEvent } from '@/lib/analytics'
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

function getMessageLengthBucket(length: number): string {
  if (length < 50) return '10-49'
  if (length < 250) return '50-249'
  if (length < 1000) return '250-999'
  return '1000+'
}

export function FeedbackForm({ onSuccess }: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackType>('general')
  const [message, setMessage] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const { capturing, capture } = useScreenshotCapture()

  const mutation = useMutation({
    mutationFn: async (data: FeedbackCreate) => {
      // Get auth session for Bearer token
      const session = await getSession()

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch(resolveApiUrl('/api/v1/feedback'), {
        method: 'POST',
        headers,
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
      trackEvent('feedback_submitted', {
        feedback_type: type,
        has_screenshot: Boolean(screenshotUrl),
        message_length_bucket: getMessageLengthBucket(message.length),
      })
      toast.success('Feedback submitted', {
        description: 'Thanks for sending that.',
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
      user_agent: navigator.userAgent,
      metadata: {
        user_agent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
    })
  }

  const getPlaceholder = () => {
    switch (type) {
      case 'bug':
        return 'Describe the bug and steps to reproduce...'
      case 'feature_request':
        return 'Describe the feature you would like...'
      default:
        return 'Share your thoughts...'
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4" noValidate>
      {/* Feedback Type Selector */}
      <div className="space-y-2">
        <Label id="feedback-type-label">Type</Label>
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => v && setType(v as FeedbackType)}
          className="justify-start"
          aria-labelledby="feedback-type-label"
        >
          {feedbackTypes.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              className="flex items-center gap-2"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
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
          placeholder={getPlaceholder()}
          value={message}
          onChange={(e) =>
            setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
          }
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

      {/* Screenshot Capture Button */}
      {!screenshotUrl && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={async () => {
            const url = await capture()
            if (url) {
              setScreenshotUrl(url)
              trackEvent('feedback_screenshot_captured', {
                feedback_type: type,
              })
              toast.success('Screenshot captured')
            } else {
              trackEvent('feedback_screenshot_failed', {
                feedback_type: type,
              })
              toast.error('Failed to capture screenshot')
            }
          }}
          disabled={capturing}
        >
          <Camera className="h-4 w-4 mr-2" />
          {capturing ? 'Capturing...' : 'Attach Screenshot'}
        </Button>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={mutation.isPending || message.length < 10 || capturing}
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit Feedback'
        )}
      </Button>
    </form>
  )
}
