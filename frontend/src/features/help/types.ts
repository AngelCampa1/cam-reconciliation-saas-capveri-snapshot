import type { LucideIcon } from 'lucide-react'

export interface HelpStep {
  title: string
  body: string
}

export interface HelpTopic {
  id: string
  title: string
  summary: string
  category: string
  icon: LucideIcon
  steps: HelpStep[]
  href?: string
  ctaLabel?: string
  keywords: string[]
  routes?: string[]
  terms?: string[]
  audiences?: Array<'landlord' | 'tenant' | 'admin'>
  relatedTopicIds?: string[]
  primaryAction?: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
}

export interface HelpGuide {
  id: string
  title: string
  description: string
  topics: HelpTopic[]
}

export interface GlossaryTerm {
  id: string
  term: string
  plainDefinition: string
  domainDefinition: string
  example: string
  relatedTopicIds: string[]
}

export interface FieldHelpSpec {
  fieldId: string
  label: string
  shortHelp: string
  longHelpTopicId?: string
  examples?: string[]
}
