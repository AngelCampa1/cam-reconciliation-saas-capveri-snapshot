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
import { cn } from '@/lib/utils'
import { FeedbackForm } from './FeedbackForm'

interface FeedbackWidgetProps {
  position?: 'bottom-right' | 'bottom-left'
}

export function FeedbackWidget({
  position = 'bottom-right',
}: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false)

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          data-feedback-widget="true"
          size="icon"
          className={cn(
            'fixed z-modal h-12 w-12 rounded-full shadow-md transition-all duration-fast hover:shadow-lg hover:scale-105',
            positionClasses[position]
          )}
          aria-label="Send feedback"
        >
          <MessageSquarePlus className="h-5 w-5" aria-hidden="true" />
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
