import Link from 'next/link'
import { Suspense } from 'react'
import { readFeedbackStore, readConfig } from '@/lib/storage'
import { PRODUCT_TAGS, SERVICE_TAGS, CHURN_TAGS, TAGS_BY_APP_TYPE, APP_TYPES } from '@/types'
import type { AppType } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkButton } from '@/components/ui/link-button'
import { AlertCircle, ThumbsUp, Lightbulb, BarChart3, Link2, RefreshCw } from 'lucide-react'
import type { FeedbackItem } from '@/types'
import { SyncAllButton } from '@/components/dashboard/sync-all-button'
import { FeedbackTimeline, type TimelineBucket } from '@/components/dashboard/feedback-timeline'
import { DashboardDateFilter } from '@/components/dashboard/date-filter'

// Robinhood palette
const RH = {
  issue:    '#FF5000',
  praise:   '#00C805',
  feature:  '#FFB800',
} as const

// Product area tag colors
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  'Dashboard':        { bg: 'rgba(123,97,255,0.15)',  text: '#9B7FFF' },
  'Reports':          { bg: 'rgba(0,150,255,0.15)',   text: '#4BAAFF' },
  'Bill Pay':         { bg: 'rgba(255,184,0,0.15)',   text: '#FFB800' },
  'Reimbursements':   { bg: 'rgba(255,80,0,0.15)',    text: '#FF7040' },
  'Checking / Debit': { bg: 'rgba(0,200,210,0.15)',   text: '#00C8D2' },
  'Credit Cards':     { bg: 'rgba(180,100,255,0.15)', text: '#C47FFF' },
  'Treasury':         { bg: 'rgba(0,200,5,0.15)',     text: '#00C805' },
  'Integrations':     { bg: 'rgba(255,100,130,0.15)', text: '#FF6482' },
  'AI CFO':           { bg: 'rgba(0,212,255,0.15)',   text: '#00D4FF' },
}

// Source logo config
const SOURCE_LOGOS: Record<string, { logo: string; alt: string }> = {
  avoma: { logo: 'https://www.google.com/s2/favicons?domain=avoma.com&sz=32',  alt: 'Avoma' },
  front: { logo: 'https://www.google.com/s2/favicons?domain=front.com&sz=32',  alt: 'Front' },
  slack: { logo: 'https://www.google.com/s2/favicons?domain=slack.com&sz=32',  alt: 'Slack' },
}

function buildSourceUrl(item: FeedbackItem): string | null {
  if (item.source === 'avoma') {
    return `https://app.avoma.com/meetings/${item.rawSourceId}`
  }
  if (item.source === 'front') {
    return `https://app.frontapp.com/open/${item.rawSourceId}`
  }
  if (item.source === 'slack') {
    // rawSourceId: 'slack-{channelId}-{ts}'
    const withoutPrefix = item.rawSourceId.replace(/^slack-/, '')
    const dashIdx = withoutPrefix.indexOf('-')
    if (dashIdx > 0) {
      const channelId = withoutPrefix.slice(0, dashIdx)
      const ts = withoutPrefix.slice(dashIdx + 1)
      // Slack permalink: requires workspace domain; best-effort channel link
      return `https://app.slack.com/client/${channelId}/p${ts.replace('.', '')}`
    }
    return null
  }
  return null
}

function urgencyColor(urgency: FeedbackItem['urgency']): 'destructive' | 'secondary' | 'outline' {
  return urgency === 'high' ? 'destructive' : urgency === 'medium' ? 'secondary' : 'outline'
}

function sourceLabel(source: FeedbackItem['source']) {
  return source === 'avoma' ? 'Avoma' : source === 'front' ? 'Front' : 'Slack'
}

function typeIcon(type: FeedbackItem['type']) {
  if (type === 'issue') return <AlertCircle className="w-3 h-3" style={{ color: RH.issue }} />
  if (type === 'praise') return <ThumbsUp className="w-3 h-3" style={{ color: RH.praise }} />
  return <Lightbulb className="w-3 h-3" style={{ color: RH.feature }} />
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; tag?: string; type?: string; urgency?: string; app?: string }>
}) {
  const params = await searchParams
  const startDate = params.startDate
  const endDate = params.endDate
  const tagFilter = params.tag
  const typeFilter = params.type
  const urgencyFilter = params.urgency
  const appParam = params.app as AppType | undefined

  const [store, config] = await Promise.all([readFeedbackStore(), readConfig()])
  const allItems = store.items

  // Apply filters
  const items = allItems.filter((item) => {
    // App type filter (product includes legacy items with no appType)
    if (appParam) {
      if (appParam === 'product' && item.appType && item.appType !== 'product') return false
      if (appParam !== 'product' && item.appType !== appParam) return false
    }
    if (startDate && item.date < startDate) return false
    if (endDate && item.date > endDate) return false
    if (typeFilter && item.type !== typeFilter) return false
    if (urgencyFilter && item.urgency !== urgencyFilter) return false
    return true
  })

  const total = items.length

  const byType = {
    issue: items.filter((i) => i.type === 'issue').length,
    praise: items.filter((i) => i.type === 'praise').length,
    recommendation: items.filter((i) => i.type === 'recommendation').length,
  }

  const byUrgency = {
    high: items.filter((i) => i.urgency === 'high').length,
  }

  const recentItems = [...items]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)

  // Items filtered by tag for the timeline only
  const timelineItems = tagFilter
    ? items.filter((i) => (i.tags ?? []).includes(tagFilter))
    : items

  // Build timeline buckets for the selected range (or last 14 days)
  const timelineBuckets: TimelineBucket[] = (() => {
    if (allItems.length === 0) return []

    const today = new Date()
    let rangeStart: Date
    let rangeEnd: Date

    if (startDate || endDate) {
      rangeStart = startDate ? new Date(startDate) : new Date(allItems.map(i => i.date).sort()[0])
      rangeEnd = endDate ? new Date(endDate) : today
    } else {
      rangeEnd = today
      rangeStart = new Date(today)
      rangeStart.setDate(rangeStart.getDate() - 13)
    }

    const dayCount = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1
    const useWeekly = dayCount > 45

    if (useWeekly) {
      // Weekly buckets
      const buckets: TimelineBucket[] = []
      const cursor = new Date(rangeStart)
      // Snap to Monday
      cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))
      while (cursor <= rangeEnd) {
        const weekStart = cursor.toISOString().split('T')[0]
        const weekEnd = new Date(cursor)
        weekEnd.setDate(weekEnd.getDate() + 6)
        const weekEndStr = weekEnd.toISOString().split('T')[0]
        const label = cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const weekItems = timelineItems.filter((item) => item.date >= weekStart && item.date <= weekEndStr)
        buckets.push({
          date: weekStart,
          endDate: weekEndStr,
          label,
          issue: weekItems.filter((x) => x.type === 'issue').length,
          praise: weekItems.filter((x) => x.type === 'praise').length,
          recommendation: weekItems.filter((x) => x.type === 'recommendation').length,
        })
        cursor.setDate(cursor.getDate() + 7)
      }
      return buckets
    }

    // Daily buckets
    return Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(rangeStart)
      d.setDate(d.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const dayItems = timelineItems.filter((item) => item.date === dateStr)
      return {
        date: dateStr,
        label,
        issue: dayItems.filter((x) => x.type === 'issue').length,
        praise: dayItems.filter((x) => x.type === 'praise').length,
        recommendation: dayItems.filter((x) => x.type === 'recommendation').length,
      }
    })
  })()

  const connectedCount = [
    config.avoma?.apiKey,
    config.front?.bearerToken,
    config.slack?.botToken,
    config.anthropic?.apiKey,
  ].filter(Boolean).length

  const appSuffix = appParam ? `&app=${appParam}` : ''
  const appLabel = appParam ? APP_TYPES[appParam] : null

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {appLabel && (
            <p className="text-xs text-primary font-medium mb-0.5">{appLabel}</p>
          )}
          <p className="text-muted-foreground mt-1">
            {allItems.length > 0
              ? `${total} of ${allItems.length} feedback items${store.lastAnalyzedAt ? ` · Last analyzed ${new Date(store.lastAnalyzedAt).toLocaleDateString()}` : ''}`
              : 'No feedback data yet. Connect your integrations to get started.'}
          </p>
        </div>
        <SyncAllButton />
      </div>

      {/* Date range filter */}
      <div className="mb-6">
        <Suspense fallback={null}>
          <DashboardDateFilter startDate={startDate} endDate={endDate} tag={tagFilter} type={typeFilter} urgency={urgencyFilter} appType={appParam} />
        </Suspense>
      </div>

      {connectedCount < 2 && (
        <div className="mb-6 p-4 rounded-lg border border-amber-500/20 bg-amber-500/10 flex items-center gap-3">
          <Link2 className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">
              {connectedCount === 0
                ? 'No integrations connected.'
                : `${connectedCount} of 4 integrations connected.`}
            </p>
            <p className="text-xs text-amber-400/70">
              Connect Anthropic AI + at least one data source (Avoma, Front, or Slack) to start analyzing feedback.
            </p>
          </div>
          <LinkButton href="/integrations" variant="outline" size="sm" className="shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
            Set up integrations
          </LinkButton>
        </div>
      )}

      {/* Timeline Chart */}
      {timelineBuckets.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feedback Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <FeedbackTimeline buckets={timelineBuckets} activeFilters={{ tag: tagFilter, urgency: urgencyFilter, app: appParam }} />
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Feedback"
          value={total}
          href={`/feedback${appParam ? `?app=${appParam}` : ''}`}
          icon={
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-foreground" />
            </div>
          }
        />
        <StatCard
          title="Issues"
          value={byType.issue}
          href={`/feedback?type=issue${appSuffix}`}
          icon={
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${RH.issue}22` }}>
              <AlertCircle className="w-5 h-5" style={{ color: RH.issue }} />
            </div>
          }
          sub={byUrgency.high > 0 ? `${byUrgency.high} high urgency` : undefined}
          subColor={byUrgency.high > 0 ? 'font-medium' : undefined}
          subStyle={byUrgency.high > 0 ? { color: RH.issue } : undefined}
        />
        <StatCard
          title="Praises"
          value={byType.praise}
          href={`/feedback?type=praise${appSuffix}`}
          icon={
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${RH.praise}22` }}>
              <ThumbsUp className="w-5 h-5" style={{ color: RH.praise }} />
            </div>
          }
        />
        <StatCard
          title="Recommendations"
          value={byType.recommendation}
          href={`/feedback?type=recommendation${appSuffix}`}
          icon={
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${RH.feature}22` }}>
              <Lightbulb className="w-5 h-5" style={{ color: RH.feature }} />
            </div>
          }
        />
      </div>

      {/* Breakdowns */}
      {total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* By Area — label and tags depend on active app type */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {appParam === 'service' ? 'By Service Area' : appParam === 'churn_risk' ? 'By Churn Reason' : 'By Product Area'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(TAGS_BY_APP_TYPE[appParam as AppType] ?? PRODUCT_TAGS).map((tag) => {
                  const count = items.filter((i) => (i.tags ?? []).includes(tag)).length
                  if (count === 0) return null
                  return (
                    <Link
                      key={tag}
                      href={`/feedback?tag=${encodeURIComponent(tag)}${appSuffix}`}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-75"
                      style={{ background: TAG_COLORS[tag]?.bg ?? 'rgba(100,100,100,0.15)', color: TAG_COLORS[tag]?.text ?? '#aaa' }}
                    >
                      <span>{tag}</span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: TAG_COLORS[tag]?.bg ? TAG_COLORS[tag].bg.replace('0.15', '0.30') : 'rgba(100,100,100,0.25)' }}
                      >{count}</span>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Items */}
      {recentItems.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Feedback</CardTitle>
              <LinkButton href={`/feedback${appParam ? `?app=${appParam}` : ''}`} variant="ghost" size="sm">
                View all
              </LinkButton>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {recentItems.map((item) => {
                const srcUrl = buildSourceUrl(item)
                const srcLogo = SOURCE_LOGOS[item.source]
                return (
                  <div key={item.id} className="py-3 flex items-start gap-3 hover:bg-muted/20 -mx-4 px-4 transition-colors">
                    <div className="mt-0.5 shrink-0">{typeIcon(item.type)}</div>
                    <Link href={`/feedback?id=${item.id}${appSuffix}`} className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {item.customer}
                          {item.rep !== 'Unknown' ? ` · ${item.rep}` : ''} · {item.date}
                        </p>
                        {(item.tags ?? []).map((tag) => {
                          const colors = TAG_COLORS[tag] ?? { bg: 'rgba(100,100,100,0.15)', text: '#aaa' }
                          return (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ background: colors.bg, color: colors.text }}
                            >
                              {tag}
                            </span>
                          )
                        })}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      {srcLogo && srcUrl ? (
                        <a
                          href={srcUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open in ${srcLogo.alt}`}
                          className="flex items-center justify-center w-6 h-6 rounded overflow-hidden hover:opacity-75 transition-opacity shrink-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={srcLogo.logo} alt={srcLogo.alt} width={18} height={18} className="rounded" />
                        </a>
                      ) : (
                        <Badge variant="outline" className="text-xs">{sourceLabel(item.source)}</Badge>
                      )}
                      <Badge variant={urgencyColor(item.urgency)} className="text-xs">
                        {item.urgency}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No feedback data yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Connect your integrations and sync to start seeing feedback here.
            </p>
            <LinkButton href="/integrations" size="sm">
              Go to Integrations
            </LinkButton>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
  sub,
  subColor,
  subStyle,
  href,
}: {
  title: string
  value: number
  icon: React.ReactNode
  sub?: string
  subColor?: string
  subStyle?: React.CSSProperties
  href?: string
}) {
  const content = (
    <Card className={href ? 'transition-colors hover:bg-muted/40 cursor-pointer' : ''}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">{title}</p>
          {icon}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && (
          <p className={`text-xs mt-0.5 ${subColor ?? 'text-muted-foreground'}`} style={subStyle}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  )

  if (href) return <Link href={href} className="block">{content}</Link>
  return content
}
