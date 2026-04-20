'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FileText, Download, Loader2, Copy, ChevronDown, ChevronUp, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { ReportRequest, FeedbackItem, WorkflowStatus } from '@/types'

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  reviewed:    { label: 'Reviewed',    color: 'text-violet-400',  bg: 'bg-violet-500/10 border border-violet-500/20' },
  action_plan: { label: 'Action Plan', color: 'text-blue-400',    bg: 'bg-blue-500/10 border border-blue-500/20' },
  in_progress: { label: 'In Progress', color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border border-yellow-500/20' },
  completed:   { label: 'Completed',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border border-emerald-500/20' },
  none:        { label: 'Not Started', color: 'text-muted-foreground', bg: 'bg-muted/40' },
}

const URGENCY_COLOR: Record<string, string> = {
  high: 'text-red-400', medium: 'text-yellow-400', low: 'text-muted-foreground',
}

function TeamAssignmentsPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [companyAssignments, setCompanyAssignments] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      fetch('/api/feedback?limit=2000').then(r => r.json()),
      fetch('/api/company-assignments').then(r => r.json()),
    ]).then(([fd, ca]) => {
      setItems((fd.items ?? []).filter((i: FeedbackItem) => i.assignedTo))
      setCompanyAssignments(ca.assignments ?? {})
    }).finally(() => setLoading(false))
  }, [])

  function toggle(email: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(email) ? next.delete(email) : next.add(email)
      return next
    })
  }

  function toggleTicket(id: string) {
    setExpandedTickets(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Group tickets by assignee
  const byAssignee = new Map<string, FeedbackItem[]>()
  for (const item of items) {
    const key = item.assignedTo!
    if (!byAssignee.has(key)) byAssignee.set(key, [])
    byAssignee.get(key)!.push(item)
  }

  // Also gather company-level assignments
  const companiesByAssignee = new Map<string, string[]>()
  for (const [company, email] of Object.entries(companyAssignments)) {
    if (!companiesByAssignee.has(email)) companiesByAssignee.set(email, [])
    companiesByAssignee.get(email)!.push(company)
  }

  // All unique assignees across both
  const allAssignees = [...new Set([...byAssignee.keys(), ...companiesByAssignee.keys()])].sort()

  const stageCounts = (ticketList: FeedbackItem[]) => {
    const counts: Record<string, number> = { none: 0, reviewed: 0, action_plan: 0, in_progress: 0, completed: 0 }
    for (const t of ticketList) counts[t.workflowStatus ?? 'none']++
    return counts
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading team assignments…
    </div>
  )

  if (allAssignees.length === 0) return (
    <p className="text-sm text-muted-foreground py-4">No tickets or companies have been assigned yet.</p>
  )

  return (
    <div className="space-y-2">
      {allAssignees.map(email => {
        const tickets = byAssignee.get(email) ?? []
        const companies = companiesByAssignee.get(email) ?? []
        const isOpen = expanded.has(email)
        const counts = stageCounts(tickets)
        const initials = email.slice(0, 2).toUpperCase()

        return (
          <div key={email} className="rounded-lg border border-border overflow-hidden">
            {/* Assignee header */}
            <div
              className="flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => toggle(email)}
            >
              <span className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {initials}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{email}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
                  {companies.length > 0 && (
                    <span className="text-xs text-muted-foreground">· {companies.length} company account{companies.length !== 1 ? 's' : ''}</span>
                  )}
                  {/* Stage pill summary */}
                  {Object.entries(counts).filter(([, n]) => n > 0).map(([stage, n]) => (
                    <span key={stage} className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold', STAGE_CONFIG[stage].bg, STAGE_CONFIG[stage].color)}>
                      {n} {STAGE_CONFIG[stage].label}
                    </span>
                  ))}
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div className="divide-y divide-border">
                {/* Company accounts */}
                {companies.length > 0 && (
                  <div className="px-4 py-3 bg-muted/10">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Company Accounts</p>
                    <div className="flex flex-wrap gap-1.5">
                      {companies.map(c => (
                        <span key={c} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-muted/60 text-foreground">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Tickets */}
                {tickets.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tickets</p>
                    </div>
                    {tickets.map(ticket => {
                      const stage = ticket.workflowStatus ?? 'none'
                      const stageConf = STAGE_CONFIG[stage]
                      const isTicketOpen = expandedTickets.has(ticket.id)
                      return (
                        <div key={ticket.id} className="border-t border-border/50 first:border-t-0">
                          {/* Ticket summary row */}
                          <div
                            className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                            onClick={() => toggleTicket(ticket.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{ticket.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {ticket.customer}{ticket.rep !== 'Unknown' ? ` · ${ticket.rep}` : ''} · {ticket.date}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={cn('text-xs font-medium', URGENCY_COLOR[ticket.urgency])}>{ticket.urgency}</span>
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', stageConf.bg, stageConf.color)}>
                                {stageConf.label}
                              </span>
                              {isTicketOpen
                                ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                            </div>
                          </div>
                          {/* Expanded ticket detail */}
                          {isTicketOpen && (
                            <div className="px-4 pb-3 pt-0 bg-muted/10 border-t border-border/40">
                              {ticket.description && (
                                <p className="text-sm text-foreground/80 leading-relaxed mb-2">{ticket.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                {(ticket.tags ?? []).map(tag => (
                                  <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted/60 text-muted-foreground">{tag}</span>
                                ))}
                                {ticket.reviewedNotes && (
                                  <span className="text-xs text-muted-foreground italic">Notes: {ticket.reviewedNotes}</span>
                                )}
                              </div>
                              {(ticket.actionItems ?? []).length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {ticket.actionItems!.map(ai => (
                                    <div key={ai.id} className="flex items-center gap-2 text-xs">
                                      <span className={ai.checked ? 'text-emerald-400' : 'text-muted-foreground'}>
                                        {ai.checked ? '✓' : '○'}
                                      </span>
                                      <span className={ai.checked ? 'line-through text-muted-foreground' : ''}>{ai.text}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const REPORT_TYPES: { value: ReportRequest['type']; label: string; description: string }[] = [
  {
    value: 'weekly_summary',
    label: 'Weekly Summary',
    description: 'High-level overview of all feedback this week, organized by type and urgency',
  },
  {
    value: 'issues_deep_dive',
    label: 'Issues Deep Dive',
    description: 'Detailed analysis of all issues, patterns, and recommended fixes',
  },
  {
    value: 'praises',
    label: 'Praises & Wins',
    description: 'Positive feedback and what customers love about Zeni',
  },
  {
    value: 'feature_requests',
    label: 'Recommendations',
    description: 'Customer recommendations ranked by frequency and business impact',
  },
  {
    value: 'custom',
    label: 'Custom Report',
    description: 'Write your own prompt for a custom analysis',
  },
]

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportRequest['type']>('weekly_summary')
  const [customPrompt, setCustomPrompt] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState('')

  async function generateReport() {
    setGenerating(true)
    setReport('')

    const body: ReportRequest = {
      type: reportType,
      ...(reportType === 'custom' ? { customPrompt } : {}),
      ...(dateFrom && dateTo ? { dateRange: { from: dateFrom, to: dateTo } } : {}),
    }

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to generate report')
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setReport(accumulated)
      }
    } catch (err) {
      toast.error(String(err))
    } finally {
      setGenerating(false)
    }
  }

  function copyReport() {
    navigator.clipboard.writeText(report)
    toast.success('Report copied to clipboard')
  }

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zeni-feedback-report-${reportType}-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectedType = REPORT_TYPES.find((r) => r.value === reportType)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Generate AI-powered reports from your product feedback data
        </p>
      </div>

      {/* Team Assignments */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Team Assignments</h2>
        </div>
        <TeamAssignmentsPanel />
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold">AI Reports</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Generate AI-powered analysis from your feedback data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Report Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1 w-full">
                {REPORT_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    onClick={() => setReportType(rt.value)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-md transition-colors',
                      reportType === rt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <p className="text-sm font-medium">{rt.label}</p>
                    <p className="text-xs opacity-70 font-normal leading-tight mt-0.5">
                      {rt.description}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {reportType === 'custom' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Custom Prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="e.g., Analyze all feedback from enterprise customers and identify the top 5 product pain points..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="min-h-[120px]"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Date Range (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="date-from" className="text-xs">From</Label>
                <input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="date-to" className="text-xs">To</Label>
                <input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={generateReport}
            disabled={generating || (reportType === 'custom' && !customPrompt.trim())}
            className="w-full"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>
        </div>

        {/* Report Output */}
        <div className="lg:col-span-2">
          <Card className="h-full min-h-[500px]">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">
                {report ? selectedType?.label : 'Report Output'}
              </CardTitle>
              {report && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyReport}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadReport}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {generating && !report ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-sm text-muted-foreground">Generating report...</span>
                </div>
              ) : report ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{report}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Select a report type and click &ldquo;Generate Report&rdquo; to create an AI-powered analysis.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
