import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FieldHelpLabel } from './FieldHelpLabel'

describe('FieldHelpLabel', () => {
  it('renders an accessible help trigger for known fields', () => {
    render(
      <TooltipProvider>
        <FieldHelpLabel fieldId="targetOccupancy">
          Target Occupancy
        </FieldHelpLabel>
      </TooltipProvider>
    )

    expect(screen.getByText('Target Occupancy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Help:/ })).toBeInTheDocument()
  })
})
