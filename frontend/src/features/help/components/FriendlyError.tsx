import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface FriendlyErrorProps {
  title?: string
  message: string
  recovery?: string
}

export function FriendlyError({
  title = 'Something needs attention',
  message,
  recovery = 'Try again. If it keeps happening, open Help. Search for the step you were on.',
}: FriendlyErrorProps) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <span className="block">{message}</span>
        <span className="mt-1 block">{recovery}</span>
      </AlertDescription>
    </Alert>
  )
}
