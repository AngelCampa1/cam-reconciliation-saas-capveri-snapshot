import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { glossaryTerms, helpCategories, helpTopics } from '@/features/help'
import { HelpTopicCard } from '@/features/help/components'
import { VideoCard } from '@/components/video'
import { getVideoForPlacement } from '@/generated/videos'
import { publicKnowledge } from '@/generated/public-knowledge'

export function HelpPage() {
  const [query, setQuery] = useState('')

  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return helpTopics

    return helpTopics.filter((topic) => {
      const searchable = [
        topic.title,
        topic.summary,
        topic.category,
        ...topic.keywords,
        ...(topic.terms ?? []),
        ...topic.steps.flatMap((step) => [step.title, step.body]),
      ]
        .join(' ')
        .toLowerCase()

      return searchable.includes(normalized)
    })
  }, [query])

  const filteredTerms = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return glossaryTerms

    return glossaryTerms.filter((term) =>
      [term.term, term.plainDefinition, term.domainDefinition, term.example]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    )
  }, [query])

  return (
    <PageContainer>
      <PageHeader
        title="Help"
        description="Step-by-step guides for setting up CapVeri, uploading files, checking calculations, and helping tenants."
      />

      <div className="space-y-8">
        <section className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          {/* A highlighted intro callout, not a navigable content section - kept
              as a styled <p> so it doesn't read as a peer heading to the "Start
              here" category H2 below (ambiguous duplicate for SR heading nav). */}
          <p className="text-lg font-semibold text-foreground">
            New to CapVeri? Start here.
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground">
            CapVeri works from files you already have: tenant lists, accounting
            spreadsheets, lease PDFs, and billing reports. You do not need an
            integration or a technical setup. Start with a property, upload the
            files you can find, and review every result before sending anything
            to tenants.
          </p>
        </section>

        {(() => {
          const v = getVideoForPlacement('app-help')
          return v ? (
            <div className="w-full max-w-xs">
              <p className="mb-2 text-xs text-muted-foreground">
                Watch a quick demo
              </p>
              <VideoCard video={v} />
            </div>
          ) : null
        })()}

        <div className="relative max-w-xl">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search help"
            placeholder="Search PDFs, uploads, rent roll, reconciliation..."
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {query.trim() ? (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Search results
            </h2>
            {filteredTerms.length > 0 && (
              <div className="mb-6 grid gap-3 lg:grid-cols-2">
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
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredTopics.map((topic) => (
                <HelpTopicCard key={topic.id} topic={topic} />
              ))}
            </div>
            {filteredTopics.length === 0 && filteredTerms.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No help topics match that search. Try PDF, upload, GL, rent
                roll, or dispute.
              </div>
            )}
          </section>
        ) : (
          <>
            <section>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Glossary
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {glossaryTerms.map((term) => (
                  <article
                    key={term.id}
                    className="rounded-lg border border-border bg-card p-4 text-sm"
                  >
                    <p className="font-semibold text-foreground">{term.term}</p>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                      {term.plainDefinition}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            {helpCategories.map((category) => {
              const topics = filteredTopics.filter(
                (topic) => topic.category === category
              )
              if (topics.length === 0) return null

              return (
                <section key={category}>
                  <h2 className="mb-4 text-lg font-semibold text-foreground">
                    {category}
                  </h2>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {topics.map((topic) => (
                      <HelpTopicCard key={topic.id} topic={topic} />
                    ))}
                  </div>
                </section>
              )
            })}
          </>
        )}
      </div>

      <section className="rounded-lg border border-border bg-muted/40 p-6 text-center">
        <p className="text-base font-semibold text-foreground">
          Still need help?
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Send us the question and we will route it to support, billing, or
          product.
        </p>
        <div className="mt-4">
          <Button asChild>
            <a href={publicKnowledge.contacts.byId.support.mailto}>
              Contact support
            </a>
          </Button>
        </div>
      </section>
    </PageContainer>
  )
}
