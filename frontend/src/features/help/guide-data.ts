import {
  BookOpen,
  Building2,
  Calculator,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  MessageSquareWarning,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { publicKnowledge } from '@/generated/public-knowledge'
import type { HelpGuide, HelpTopic } from './types'

const topicIconMap: Record<string, LucideIcon> = {
  'start-here': Building2,
  'what-files-do-i-need': FileQuestion,
  'upload-a-spreadsheet': FileSpreadsheet,
  'upload-a-pdf': FileText,
  'run-reconciliation': Calculator,
  'download-pdf': BookOpen,
  'tenant-dispute': MessageSquareWarning,
  'fix-upload-problems': Upload,
  'verify-lease-terms': FileText,
  'map-expense-pools': Calculator,
  'review-findings': MessageSquareWarning,
  'finalize-reconciliation': Calculator,
  'manage-billing': BookOpen,
  'invite-team': Building2,
}

export const helpTopics = publicKnowledge.appHelp.topics.map((topic) => {
  const adapted: HelpTopic = {
    id: topic.id,
    title: topic.title,
    summary: topic.summary,
    category: topic.category,
    icon: topicIconMap[topic.id] ?? HelpCircle,
    steps: topic.steps.map((step) => ({ ...step })),
    keywords: [...topic.keywords],
  }

  if ('href' in topic) adapted.href = topic.href
  if ('ctaLabel' in topic) adapted.ctaLabel = topic.ctaLabel
  if ('routes' in topic) adapted.routes = [...topic.routes]
  if ('terms' in topic) adapted.terms = [...topic.terms]
  if ('audiences' in topic) adapted.audiences = [...topic.audiences]
  if ('relatedTopicIds' in topic && Array.isArray(topic.relatedTopicIds)) {
    adapted.relatedTopicIds = [...topic.relatedTopicIds]
  }
  if ('primaryAction' in topic) adapted.primaryAction = topic.primaryAction
  if ('difficulty' in topic) adapted.difficulty = topic.difficulty

  return adapted
})

export const helpGuides = publicKnowledge.appHelp.guides.map((guide) => ({
  id: guide.id,
  title: guide.title,
  description: guide.description,
  topics: guide.topicIds
    .map((id) => helpTopics.find((topic) => topic.id === id))
    .filter((topic): topic is HelpTopic => Boolean(topic)),
})) satisfies HelpGuide[]

export const helpCategories = [...publicKnowledge.appHelp.categories]

export const helpCategoryIcons = {
  'Start here': BookOpen,
  'Upload files': Upload,
  'Understand CAM': Calculator,
  'Fix a problem': HelpCircle,
  'Tenant questions': MessageSquareWarning,
} as const
