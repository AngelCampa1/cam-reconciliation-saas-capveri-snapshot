/**
 * FieldMappingTable component.
 *
 * Displays and allows editing of ERP field mappings.
 */

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FieldMapping } from '../types'

export interface FieldMappingTableProps {
  fields: FieldMapping[]
  overrides: Partial<FieldMapping>[]
  onChange: (overrides: Partial<FieldMapping>[]) => void
}

export function FieldMappingTable({
  fields,
  overrides,
  onChange,
}: FieldMappingTableProps) {
  const handleStringFieldOverride = (
    index: number,
    field: 'targetField' | 'defaultValue',
    value: string
  ) => {
    const currentField = fields[index]
    if (!currentField) return

    const newOverrides = [...overrides]
    const baseOverride = {
      ...newOverrides[index],
      sourceField: currentField.sourceField,
    }

    if (value) {
      newOverrides[index] = { ...baseOverride, [field]: value }
    } else {
      newOverrides[index] = baseOverride
    }
    onChange(newOverrides)
  }

  const handleTransformOverride = (
    index: number,
    value: FieldMapping['transform']
  ) => {
    const currentField = fields[index]
    if (!currentField) return

    const newOverrides = [...overrides]
    const baseOverride = {
      ...newOverrides[index],
      sourceField: currentField.sourceField,
    }

    if (value) {
      newOverrides[index] = { ...baseOverride, transform: value }
    } else {
      newOverrides[index] = baseOverride
    }
    onChange(newOverrides)
  }

  const handleNumberFieldOverride = (
    index: number,
    field: 'maxLength',
    value: string
  ) => {
    const currentField = fields[index]
    if (!currentField) return

    const newOverrides = [...overrides]
    const numValue = value === '' ? undefined : parseInt(value, 10)
    const baseOverride = {
      ...newOverrides[index],
      sourceField: currentField.sourceField,
    }

    if (numValue !== undefined && !isNaN(numValue)) {
      newOverrides[index] = { ...baseOverride, [field]: numValue }
    } else {
      newOverrides[index] = baseOverride
    }
    onChange(newOverrides)
  }

  const getStringValue = (index: number, field: keyof FieldMapping): string => {
    const currentField = fields[index]
    if (!currentField) return ''

    const override = overrides.find(
      (o) => o.sourceField === currentField.sourceField
    )
    const value = override?.[field] ?? currentField[field]
    return value === undefined ? '' : String(value)
  }

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Field mapping configuration</caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Source Field
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Target Field
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Transform
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Default Value
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium">
                Max Length
              </th>
              <th
                scope="col"
                className="hidden sm:table-cell px-4 py-3 text-left font-medium"
              >
                Required
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((field, index) => (
              <tr
                key={field.sourceField}
                className="transition-colors duration-fast hover:bg-muted/50 align-middle"
              >
                <td className="px-4 py-3">
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {field.sourceField}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <Input
                    aria-label={`Target field for ${field.sourceField}`}
                    value={getStringValue(index, 'targetField')}
                    onChange={(e) =>
                      handleStringFieldOverride(
                        index,
                        'targetField',
                        e.target.value
                      )
                    }
                    className="h-10 sm:h-8 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <Select
                    value={getStringValue(index, 'transform') || 'none'}
                    onValueChange={(value) =>
                      handleTransformOverride(
                        index,
                        value === 'none'
                          ? undefined
                          : (value as FieldMapping['transform'])
                      )
                    }
                  >
                    <SelectTrigger
                      aria-label={`Transform for ${field.sourceField}`}
                      className="h-10 sm:h-8 text-xs w-32"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="uppercase">Uppercase</SelectItem>
                      <SelectItem value="lowercase">Lowercase</SelectItem>
                      <SelectItem value="trim">Trim</SelectItem>
                      <SelectItem value="padLeft">Pad Left</SelectItem>
                      <SelectItem value="padRight">Pad Right</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <Input
                    aria-label={`Default value for ${field.sourceField}`}
                    value={getStringValue(index, 'defaultValue')}
                    onChange={(e) =>
                      handleStringFieldOverride(
                        index,
                        'defaultValue',
                        e.target.value
                      )
                    }
                    className="h-10 sm:h-8 text-xs"
                    placeholder="Optional"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    aria-label={`Max length for ${field.sourceField}`}
                    type="number"
                    value={getStringValue(index, 'maxLength')}
                    onChange={(e) =>
                      handleNumberFieldOverride(
                        index,
                        'maxLength',
                        e.target.value
                      )
                    }
                    className="h-10 sm:h-8 text-xs w-20"
                    placeholder="-"
                  />
                </td>
                <td className="hidden sm:table-cell px-4 py-3">
                  {field.required ? (
                    <Badge variant="destructive" className="text-xs">
                      Required
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Optional
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
