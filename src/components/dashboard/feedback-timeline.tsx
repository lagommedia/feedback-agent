'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export interface TimelineBucket {
  date: string      // YYYY-MM-DD (start of bucket)
  endDate?: string  // YYYY-MM-DD (end of bucket, for weekly)
  label: string     // "Mar 4"
  issue: number
  praise: number
  feature_request: number
}

const COLORS = {
  issue:           { fill: '#FF5000', label: 'Issues' },
  feature_request: { fill: '#0096FF', label: 'Feature Requests' },
  praise:          { fill: '#00C805', label: 'Praises' },
} as const

type TypeKey = keyof typeof COLORS

export function FeedbackTimeline({
  buckets,
  activeFilters,
}: {
  buckets: TimelineBucket[]
  activeFilters?: { tag?: string; urgency?: string; app?: string }
}) {
  const router = useRouter()
  const [hovered, setHovered] = useState<{ date: string; key: TypeKey } | null>(null)

  if (!buckets.length) return null

  function bucketUrl(bucket: TimelineBucket, typeKey: TypeKey) {
    const p = new URLSearchParams()
    p.set('from', bucket.date)
    p.set('to', bucket.endDate ?? bucket.date)
    p.set('type', typeKey)
    if (activeFilters?.tag) p.set('tag', activeFilters.tag)
    if (activeFilters?.urgency) p.set('urgency', activeFilters.urgency)
    if (activeFilters?.app) p.set('app', activeFilters.app)
    return `/feedback?${p.toString()}`
  }

  const maxTotal = Math.max(...buckets.map((b) => b.issue + b.praise + b.feature_request), 1)
  const yMax = Math.ceil(maxTotal / 2) * 2 || 2
  const yTicks = Array.from({ length: yMax + 1 }, (_, i) => i).filter(
    (v) => v === 0 || v === Math.round(yMax / 2) || v === yMax
  )

  const W = 800
  const H = 160
  const PAD_LEFT = 28
  const PAD_RIGHT = 8
  const PAD_TOP = 12
  const PAD_BOTTOM = 28
  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

  const barCount = buckets.length
  const totalGap = Math.min(4, Math.floor(chartW / barCount / 3))
  const barW = (chartW - totalGap * (barCount - 1)) / barCount

  function barX(i: number) {
    return PAD_LEFT + i * (barW + totalGap)
  }
  function segY(value: number) {
    return PAD_TOP + chartH * (1 - value / yMax)
  }
  function segH(value: number) {
    return chartH * (value / yMax)
  }

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        {(Object.entries(COLORS) as [TypeKey, (typeof COLORS)[TypeKey]][]).map(
          ([key, { fill, label }]) => (
            <button
              key={key}
              onClick={() => router.push(`/feedback?type=${key}`)}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
            >
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: fill }} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </button>
          )
        )}
      </div>

      {/* Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 160 }}
        aria-label="Feedback over time"
      >
        {/* Y-axis grid lines + labels */}
        {yTicks.map((tick) => {
          const y = PAD_TOP + chartH * (1 - tick / yMax)
          return (
            <g key={tick}>
              <line
                x1={PAD_LEFT}
                x2={W - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={tick === 0 ? 0.15 : 0.08}
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 4}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill="currentColor"
                fillOpacity={0.4}
              >
                {tick}
              </text>
            </g>
          )
        })}

        {/* Stacked bars */}
        {buckets.map((bucket, i) => {
          const x = barX(i)
          const segments: Array<{ key: TypeKey; value: number }> = [
            { key: 'issue', value: bucket.issue },
            { key: 'feature_request', value: bucket.feature_request },
            { key: 'praise', value: bucket.praise },
          ]

          let stackedSoFar = 0
          return (
            <g key={bucket.date}>
              {segments.map(({ key, value }) => {
                if (value === 0) return null
                const y = segY(stackedSoFar + value)
                const h = segH(value)
                stackedSoFar += value
                const isHovered = hovered?.date === bucket.date && hovered?.key === key
                return (
                  <rect
                    key={key}
                    x={x}
                    y={y}
                    width={Math.max(barW, 1)}
                    height={h}
                    fill={COLORS[key].fill}
                    fillOpacity={isHovered ? 0.7 : 1}
                    rx={barW > 8 ? 1.5 : 0}
                    style={{ cursor: 'pointer', transition: 'fill-opacity 0.1s' }}
                    onClick={() => router.push(bucketUrl(bucket, key))}
                    onMouseEnter={() => setHovered({ date: bucket.date, key })}
                    onMouseLeave={() => setHovered(null)}
                  />
                )
              })}

              {/* X-axis label */}
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize={9}
                fill="currentColor"
                fillOpacity={0.45}
              >
                {bucket.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
