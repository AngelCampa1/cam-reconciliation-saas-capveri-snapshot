import type { ReactNode } from 'react'
import { getFieldHelp } from '../field-help-data'
import { HelpTip } from './HelpTip'

interface FieldHelpLabelProps {
  fieldId: string
  children: ReactNode
}

export function FieldHelpLabel({ fieldId, children }: FieldHelpLabelProps) {
  const help = getFieldHelp(fieldId)

  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      {help && (
        <HelpTip label={help.label}>
          <span>{help.shortHelp}</span>
          {help.examples && help.examples.length > 0 && (
            <span className="mt-2 block text-xs text-muted-foreground">
              Example: {help.examples.join(', ')}
            </span>
          )}
        </HelpTip>
      )}
    </span>
  )
}
