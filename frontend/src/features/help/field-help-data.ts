import { publicKnowledge } from '@/generated/public-knowledge'
import type { FieldHelpSpec } from './types'

export const fieldHelp = Object.fromEntries(
  Object.entries(publicKnowledge.appHelp.fieldHelp).map(([fieldId, help]) => {
    const adapted: FieldHelpSpec = {
      fieldId: help.fieldId,
      label: help.label,
      shortHelp: help.shortHelp,
    }
    if ('longHelpTopicId' in help) {
      adapted.longHelpTopicId = help.longHelpTopicId
    }
    if ('examples' in help) adapted.examples = [...help.examples]
    return [fieldId, adapted]
  })
) as Record<string, FieldHelpSpec>

export function getFieldHelp(fieldId: string): FieldHelpSpec | undefined {
  return fieldHelp[fieldId]
}
