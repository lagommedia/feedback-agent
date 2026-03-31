'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, X } from 'lucide-react'
import { PRODUCT_TAGS, SERVICE_TAGS, CHURN_TAGS } from '@/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DATE_INPUT_CLASS = 'h-8 rounded-md border border-input bg-transparent dark:bg-input/30 px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:dark]'

type FilterKey = 'startDate' | 'endDate' | 'tag' | 'type' | 'urgency'

export function DashboardDateFilter({
  startDate,
  endDate,
  tag,
  type,
  urgency,
  appType,
}: {
  startDate?: string
  endDate?: string
  tag?: string
  type?: string
  urgency?: string
  appType?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function update(key: FilterKey, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/?${params.toString()}`)
  }

  function clear() {
    // Preserve the app param when clearing other filters
    const app = searchParams.get('app')
    router.push(app ? `/?app=${app}` : '/')
  }

  const hasFilter = !!(startDate || endDate || tag || type || urgency)

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Date Range */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground font-medium px-0.5 flex items-center gap-1">
          <CalendarDays className="w-3 h-3" /> Date Range
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={startDate ?? ''}
            max={endDate ?? undefined}
            onChange={(e) => update('startDate', e.target.value)}
            className={DATE_INPUT_CLASS}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={endDate ?? ''}
            min={startDate ?? undefined}
            onChange={(e) => update('endDate', e.target.value)}
            className={DATE_INPUT_CLASS}
          />
        </div>
      </div>

      {/* Tag filter — label and options depend on active app type */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground font-medium px-0.5">
          {appType === 'service' ? 'Service Areas' : appType === 'churn_risk' ? 'Churn Reasons' : 'Product Areas'}
        </span>
        <Select value={tag ?? ''} onValueChange={(v) => update('tag', v ?? '')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={appType === 'service' ? 'All Service Areas' : appType === 'churn_risk' ? 'All Churn Reasons' : 'All Product Areas'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{appType === 'service' ? 'All Service Areas' : appType === 'churn_risk' ? 'All Churn Reasons' : 'All Product Areas'}</SelectItem>
            {(appType === 'service' ? SERVICE_TAGS : appType === 'churn_risk' ? CHURN_TAGS : PRODUCT_TAGS).map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Feedback Types */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground font-medium px-0.5">Feedback Types</span>
        <Select value={type ?? ''} onValueChange={(v) => update('type', v ?? '')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Feedback Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Feedback Types</SelectItem>
            <SelectItem value="issue">Issues</SelectItem>
            <SelectItem value="praise">Praises</SelectItem>
            <SelectItem value="feature_request">Feature Requests</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Level of Urgency */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground font-medium px-0.5">Level of Urgency</span>
        <Select value={urgency ?? ''} onValueChange={(v) => update('urgency', v ?? '')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Urgency Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Urgency Levels</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasFilter && (
        <div className="flex flex-col justify-end h-[52px]">
          <button
            onClick={clear}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors h-8"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
