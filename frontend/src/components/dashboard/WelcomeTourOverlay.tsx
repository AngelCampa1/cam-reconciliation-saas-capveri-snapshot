import { Building2, BarChart3, FileSpreadsheet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface WelcomeTourOverlayProps {
  open: boolean
  onSkip: () => void
  onStart: () => void
}

const STEPS = [
  {
    icon: Building2,
    title: 'Add a building',
    description:
      'Start with one building you own. Add the address and the spaces inside.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Add your expense file',
    description: 'Start with your cost file. We help map it.',
  },
  {
    icon: BarChart3,
    title: 'See what needs fixing',
    description: 'We check the math before you send the statement.',
  },
]

export function WelcomeTourOverlay({
  open,
  onSkip,
  onStart,
}: WelcomeTourOverlayProps) {
  const navigate = useNavigate()

  const handleStart = () => {
    onStart()
    navigate('/properties/new')
  }

  const handleSeeSample = () => {
    onStart()
    // `?demo=1` reaches the sample result for a signed-in user; a bare /onboard
    // bounces logged-in users to checkout.
    navigate('/onboard?demo=1')
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome to CapVeri</DialogTitle>
          <DialogDescription>
            Here is how it works. Three easy steps. Stop and come back any time.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {STEPS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="rounded-full" onClick={onSkip}>
            I&apos;ll look around on my own
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={handleSeeSample}
          >
            See a sample first
          </Button>
          <Button className="rounded-full" onClick={handleStart}>
            Add my first building
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
