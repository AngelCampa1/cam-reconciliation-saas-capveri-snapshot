import { publicKnowledge } from '@/generated/public-knowledge'
import type { GlossaryTerm } from './types'

export const glossaryTerms = publicKnowledge.appHelp.glossary.map((term) => ({
  ...term,
  relatedTopicIds: [...term.relatedTopicIds],
})) satisfies GlossaryTerm[]

export function findGlossaryTerm(idOrTerm: string): GlossaryTerm | undefined {
  const normalized = idOrTerm.trim().toLowerCase()
  return glossaryTerms.find(
    (item) => item.id === normalized || item.term.toLowerCase() === normalized
  )
}
