import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HelpButtonProps {
  onClick: () => void
}

export function HelpButton({ onClick }: HelpButtonProps) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <HelpCircle className="mr-1.5 h-4 w-4" />
      Help
    </Button>
  )
}
