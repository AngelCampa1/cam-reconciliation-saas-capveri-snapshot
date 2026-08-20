/**
 * Pool template selector component.
 *
 * Allows users to browse and select from available pool templates.
 */

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, CheckCircle2, Layers } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { usePoolTemplates } from '../hooks'
import type { PoolTemplateList } from '@/api/generated'

interface TemplateSelectorProps {
  /**
   * Optional filter by property type.
   */
  propertyType?: string
  /**
   * Callback when template is selected.
   */
  onSelect: (template: PoolTemplateList) => void
  /**
   * Currently selected template ID (optional).
   */
  selectedTemplateId?: string
  /**
   * Optional CSS class name.
   */
  className?: string
}

/**
 * Template selector with preview.
 *
 * Shows system templates first, followed by custom templates.
 */
export function TemplateSelector({
  propertyType,
  onSelect,
  selectedTemplateId,
  className = '',
}: TemplateSelectorProps) {
  const {
    data: templates,
    isLoading,
    isError,
    refetch,
  } = usePoolTemplates(propertyType)
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(
    null
  )

  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState
        size="sm"
        title="Couldn't load pool templates"
        action={{ onClick: () => refetch() }}
        className={className}
      />
    )
  }

  if (!templates || templates.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No templates yet"
        description="No pool templates available."
        size="sm"
        className={className ?? ''}
      />
    )
  }

  // Separate system and custom templates
  const systemTemplates = templates.filter((t) => t.is_system)
  const customTemplates = templates.filter((t) => !t.is_system)

  return (
    <div className={`space-y-6 ${className}`}>
      {/* System Templates */}
      {systemTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">
            System Templates
          </h3>
          <div className="space-y-2">
            {systemTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={template.id === selectedTemplateId}
                isPreview={template.id === previewTemplateId}
                onSelect={() => onSelect(template)}
                onPreview={(id) =>
                  setPreviewTemplateId(previewTemplateId === id ? null : id)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom Templates */}
      {customTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">
            Custom Templates
          </h3>
          <div className="space-y-2">
            {customTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={template.id === selectedTemplateId}
                isPreview={template.id === previewTemplateId}
                onSelect={() => onSelect(template)}
                onPreview={(id) =>
                  setPreviewTemplateId(previewTemplateId === id ? null : id)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Individual template card.
 */
function TemplateCard({
  template,
  isSelected,
  isPreview,
  onSelect,
  onPreview,
}: {
  template: PoolTemplateList
  isSelected: boolean
  isPreview: boolean
  onSelect: () => void
  onPreview: (id: string) => void
}) {
  return (
    <Card
      className={`p-4 cursor-pointer shadow-sm transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        isSelected
          ? 'ring-2 ring-primary bg-primary/5 shadow-sm'
          : 'hover:bg-muted/30 hover:shadow-sm'
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium text-sm">{template.name}</h4>
            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>

          {template.description && (
            <p className="text-xs text-muted-foreground mt-1">
              {template.description}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              {template.pool_count ?? 0} pool
              {(template.pool_count ?? 0) !== 1 ? 's' : ''}
            </Badge>
            {template.property_type && (
              <Badge variant="secondary" className="text-xs">
                {template.property_type}
              </Badge>
            )}
            {template.is_system && (
              <Badge variant="default" className="text-xs">
                System
              </Badge>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="ml-2"
          onClick={(e) => {
            e.stopPropagation()
            onPreview(template.id)
          }}
        >
          {isPreview ? 'Hide' : 'Preview'}
        </Button>
      </div>

      {/* Preview Section */}
      {isPreview && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">
            Full structure preview is not available yet.
          </p>
        </div>
      )}
    </Card>
  )
}
