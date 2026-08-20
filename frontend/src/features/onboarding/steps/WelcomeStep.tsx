/**
 * Welcome Step Component
 *
 * First step of onboarding - introduces the product.
 */
import { Sparkles, Calculator, Shield, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useOnboarding } from '../OnboardingContext'
import { VideoCard } from '@/components/video'
import { getVideoForPlacement } from '@/generated/videos'

const features = [
  {
    icon: Calculator,
    title: 'Exact math, every time',
    description: 'Calculations follow BOMA 2024. No rounding, no guesses.',
  },
  {
    icon: Shield,
    title: 'Your data is secure',
    description:
      'Encrypted in transit and at rest. Each org sees only its own data.',
  },
  {
    icon: Clock,
    title: 'Works from your exports',
    description: 'Upload a CSV or Excel file. No integration needed.',
  },
]

export function WelcomeStep() {
  const { user } = useAuth()
  const { nextStep } = useOnboarding()
  // Use organization name from user metadata, fall back to email prefix, then 'there'
  const userName =
    user?.user_metadata?.organization_name ||
    user?.email?.split('@')[0] ||
    'there'

  return (
    <div className="mx-auto max-w-lg text-center">
      {/* Icon */}
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>

      {/* Welcome message */}
      <h1 className="mb-3 text-xl md:text-2xl lg:text-3xl font-bold">
        Welcome, {userName}!
      </h1>
      <p className="mb-2 text-lg text-muted-foreground">
        Let&apos;s get CapVeri set up for you. It takes a few minutes.
      </p>
      <p className="mb-8 text-sm font-medium text-primary">
        Your free trial gives you full access to all features in your plan.
      </p>

      {/* Feature highlights */}
      <div className="mb-8 space-y-4 text-left">
        {features.map((feature, index) => (
          <div
            key={index}
            className="flex items-start gap-4 rounded-lg border p-4 shadow-sm transition-all duration-fast hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <feature.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{feature.title}</p>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Optional welcome video */}
      {(() => {
        const v = getVideoForPlacement('app-onboarding-welcome')
        return v ? (
          <div className="mb-6 w-full max-w-xs mx-auto text-left">
            <p className="mb-2 text-xs text-muted-foreground text-center">
              Watch a quick demo
            </p>
            <VideoCard video={v} />
          </div>
        ) : null
      })()}

      {/* CTA */}
      <Button onClick={nextStep} size="lg" className="w-full sm:w-auto">
        Get Started
      </Button>
    </div>
  )
}
