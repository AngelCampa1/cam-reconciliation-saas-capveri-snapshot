import { Shield } from 'lucide-react'

const securityPoints = [
  'Encrypted in transit and at rest',
  'PostgreSQL row-level security isolates every organization',
  'Financial calculations remain deterministic; AI-assisted extraction stays advisory and human-reviewed',
]

export function SecurityTrustPanel() {
  return (
    <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          Your financial data is protected
        </p>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {securityPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  )
}
