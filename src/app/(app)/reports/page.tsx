'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FileText, Download, Loader2, Copy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { ReportRequest } from '@/types'

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
