/**
 * DateRangePicker component.
 *
 * Simple date range picker with from/to dates.
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DateRange } from '../types'

export interface DateRangePickerProps {
  value?: DateRange
  onChange: (value: DateRange | undefined) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fromDate = e.target.value ? new Date(e.target.value) : undefined
    if (fromDate && value?.to) {
      onChange({ from: fromDate, to: value.to })
    } else if (fromDate) {
      onChange({ from: fromDate, to: new Date() })
    } else {
      onChange(undefined)
    }
  }

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const toDate = e.target.value ? new Date(e.target.value) : undefined
    if (toDate && value?.from) {
      onChange({ from: value.from, to: toDate })
    } else if (toDate) {
      onChange({ from: new Date(0), to: toDate })
    } else {
      onChange(undefined)
    }
  }

  const formatDateForInput = (date: Date | undefined): string => {
    if (!date) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return (
    <div className="flex gap-4">
      <div className="space-y-2">
        <Label htmlFor="date-from">From</Label>
        <Input
          id="date-from"
          type="date"
          value={formatDateForInput(value?.from)}
          onChange={handleFromChange}
          className="w-40"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="date-to">To</Label>
        <Input
          id="date-to"
          type="date"
          value={formatDateForInput(value?.to)}
          onChange={handleToChange}
          className="w-40"
        />
      </div>
    </div>
  )
}
