/**
 * ExitIntentDialog - Modal shown when a visitor is about to abandon signup.
 *
 * Offers a lower-friction sample result instead of asking for an email again.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics'

interface ExitIntentDialogProps {
  open: boolean
  onDismiss: () => void
}

export function ExitIntentDialog({ open, onDismiss }: ExitIntentDialogProps) {
  const navigate = useNavigate()
  const trackedRef = useRef(false)

  useEffect(() => {
    if (open && !trackedRef.current) {
      trackEvent('exit_intent_sample_offered', {
        source: 'signup',
      })
      trackedRef.current = true
    }
  }, [open])

  const handleViewSample = () => {
    trackEvent('exit_intent_sample_clicked', {
      source: 'signup',
    })
    navigate('/onboard?demo=1&source=exit-intent')
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>See a sample result first</DialogTitle>
          <DialogDescription>
            No email needed. See how CapVeri catches over-bills and under-bills
            before a statement goes out.
          </DialogDescription>
        </DialogHeader>

        <Button type="button" onClick={handleViewSample} className="w-full">
          View sample result
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            No thanks, I'll sign up now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
