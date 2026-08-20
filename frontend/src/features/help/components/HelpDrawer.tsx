import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getContextualHelpTopics } from '../contextual-help'
import { glossaryTerms } from '../glossary-data'
import { helpTopics } from '../guide-data'
import { HelpTopicCard } from './HelpTopicCard'

interface HelpDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HelpDrawer({ open, onOpenChange }: HelpDrawerProps) {
  const location = useLocation()
  const [query, setQuery] = useState('')

  const contextualTopics = useMemo(
    () => getContextualHelpTopics(location.pathname),
    [location.pathname]
  )

  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return contextualTopics

    return helpTopics.filter((topic) => {
      const haystack = [
        topic.title,
        topic.summary,
        topic.category,
        ...topic.keywords,
        ...(topic.terms ?? []),
        ...topic.steps.flatMap((step) => [step.title, step.body]),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalized)
    })
  }, [contextualTopics, query])

  const filteredTerms = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []

    return glossaryTerms.filter((term) =>
      [term.term, term.plainDefinition, term.domainDefinition, term.example]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    )
  }, [query])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            Help guide
          </SheetTitle>
          <SheetDescription>
            Plain-language steps for the page you are on. Search if you need
            something else.
          </SheetDescription>
        </SheetHeader>

        <div className="relative mt-6">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search help topics"
            placeholder="Search uploads, PDFs, rent roll, disputes..."
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="mt-6 space-y-4">
          {filteredTerms.map((term) => (
            <article
              key={term.id}
              className="rounded-lg border border-border bg-card p-4 text-sm"
            >
              <p className="font-semibold text-foreground">{term.term}</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                {term.plainDefinition}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Example: {term.example}
              </p>
            </article>
          ))}
          {filteredTopics.map((topic) => (
            <HelpTopicCard key={topic.id} topic={topic} compact />
          ))}
          {filteredTopics.length === 0 && filteredTerms.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No help topics match that search. Try words like PDF, upload, GL,
              or dispute.
            </div>
          )}
        </div>

        <Button asChild className="mt-6 w-full">
          <Link to="/help" onClick={() => onOpenChange(false)}>
            Open full help center
          </Link>
        </Button>
      </SheetContent>
    </Sheet>
  )
}
