import { HelpTip } from './HelpTip'
import { findGlossaryTerm } from '../glossary-data'

interface HelpTermProps {
  term: string
  children?: string
  /** className forwarded to the HelpTip trigger button (e.g. "hidden sm:inline-flex"). */
  tipClassName?: string
}

export function HelpTerm({ term, children, tipClassName }: HelpTermProps) {
  const item = findGlossaryTerm(term)
  if (!item) return <>{children ?? term}</>

  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-medium underline decoration-dotted underline-offset-4">
        {children ?? item.term}
      </span>
      <HelpTip
        label={item.term}
        {...(tipClassName ? { className: tipClassName } : {})}
      >
        <span className="block font-medium text-popover-foreground">
          {item.term}
        </span>
        <span className="mt-1 block">{item.plainDefinition}</span>
        <span className="mt-2 block text-xs text-muted-foreground">
          Example: {item.example}
        </span>
      </HelpTip>
    </span>
  )
}
