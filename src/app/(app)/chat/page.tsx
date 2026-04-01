'use client'

import { useChat, type Message } from 'ai/react'
import { useRef, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Loader2, Bot, User, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const STARTER_QUESTIONS = [
  'What are the most common issues this week?',
  'Which customers are experiencing the most problems?',
  'Show me all high-urgency churn risk items as a table.',
  'What features are customers requesting most? Show me a chart.',
]

// ─── Source URL builder ────────────────────────────────────────────────────────

function buildSourceUrl(source: string, rawSourceId: string): string | null {
  if (source === 'avoma') return `https://app.avoma.com/meetings/${rawSourceId}`
  if (source === 'front') return `https://app.frontapp.com/open/${rawSourceId}`
  if (source === 'slack') {
    const parts = rawSourceId.replace('slack-', '').split('-')
    if (parts.length >= 2) {
      const channelId = parts[0]
      const ts = parts.slice(1).join('-').replace('.', '')
      return `https://app.slack.com/client/${channelId}/p${ts}`
    }
  }
  return null
}

const SOURCE_LABELS: Record<string, string> = { avoma: 'Avoma', front: 'Front', slack: 'Slack' }

// ─── Chart block ──────────────────────────────────────────────────────────────

function ChartBlock({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content.trim()) as { title?: string; data: { label: string; value: number }[] }
    const { title, data } = parsed
    if (!Array.isArray(data) || data.length === 0) return null
    const height = Math.max(140, data.length * 38)
    return (
      <div className="my-3 rounded-lg bg-muted/30 border border-border/50 p-4">
        {title && (
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {title}
          </p>
        )}
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={{ fontSize: 11, fill: '#e5e7eb' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: '#1c1c1c', border: '1px solid #333', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }}
              formatter={(v) => [v, 'Count']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={`rgba(74,222,128,${Math.max(0.35, 1 - i * (0.55 / Math.max(data.length - 1, 1)))})`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  } catch {
    return null
  }
}

// ─── Mentions block ───────────────────────────────────────────────────────────

interface MentionItem {
  id?: string
  title: string
  customer?: string
  date?: string
  urgency?: string
  source?: string
  rawSourceId?: string
}

function MentionsBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  try {
    const parsed = JSON.parse(content.trim()) as { title: string; items: MentionItem[] }
    const { title, items } = parsed
    if (!Array.isArray(items)) return null
    return (
      <div className="my-3 rounded-lg border border-border overflow-hidden text-sm">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{title}</span>
            <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {items.length} mention{items.length !== 1 ? 's' : ''}
            </span>
          </div>
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
        </button>
        {open && (
          <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
            {items.map((item, i) => {
              const url =
                item.rawSourceId && item.source
                  ? buildSourceUrl(item.source, item.rawSourceId)
                  : null
              const urgencyColor =
                item.urgency === 'high'
                  ? 'text-red-400'
                  : item.urgency === 'medium'
                    ? 'text-yellow-400'
                    : 'text-muted-foreground'
              return (
                <div
                  key={i}
                  className="px-3 py-2 flex items-start justify-between gap-2 hover:bg-muted/20 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    {item.id ? (
                      <Link
                        href={`/feedback?id=${item.id}`}
                        className="text-xs font-medium leading-snug hover:text-primary hover:underline transition-colors line-clamp-2"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <p className="text-xs font-medium leading-snug">{item.title}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[
                        item.customer,
                        item.date,
                        item.urgency && <span key="u" className={urgencyColor}>{item.urgency}</span>,
                      ]
                        .filter(Boolean)
                        .reduce<React.ReactNode[]>((acc, el, idx) => {
                          if (idx > 0) acc.push(' · ')
                          acc.push(el)
                          return acc
                        }, [])}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    {item.source && (
                      <span className="text-[10px] text-muted-foreground">
                        {SOURCE_LABELS[item.source] ?? item.source}
                      </span>
                    )}
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title={`Open in ${SOURCE_LABELS[item.source ?? ''] ?? 'source'}`}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  } catch {
    return null
  }
}

// ─── Custom code block renderer ───────────────────────────────────────────────

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const lang = /language-(\w+)/.exec(className ?? '')?.[1]
  const raw = String(children ?? '').replace(/\n$/, '')
  if (lang === 'chart') return <ChartBlock content={raw} />
  if (lang === 'mentions') return <MentionsBlock content={raw} />
  return (
    <code className="bg-muted/60 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
  })

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>)
      }
    }
  }

  function handleStarterClick(question: string) {
    handleInputChange({ target: { value: question } } as React.ChangeEvent<HTMLTextAreaElement>)
    setTimeout(() => {
      textareaRef.current?.form?.requestSubmit()
    }, 50)
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b px-8 py-4 shrink-0">
        <h1 className="text-xl font-bold">AI Chat</h1>
        <p className="text-sm text-muted-foreground">
          Ask questions about your product feedback data
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-8 py-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Product Feedback Assistant</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ask questions about your synced feedback data. If you haven&apos;t synced yet,{' '}
                <Link href="/integrations" className="underline">
                  go to Integrations
                </Link>{' '}
                first.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleStarterClick(q)}
                  className="text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((message: Message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground max-w-[80%]'
                      : 'bg-muted w-full max-w-full'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-table:text-xs prose-td:py-1.5 prose-th:py-1.5 prose-thead:border-b prose-thead:border-border prose-tr:border-b prose-tr:border-border/50">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: ({ className, children }) => (
                            <CodeBlock className={className}>{children}</CodeBlock>
                          ),
                          pre: ({ children }) => <>{children}</>,
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-3">
                              <table className="w-full text-xs border-collapse">{children}</table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground border-b border-border bg-muted/40">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-3 py-2 border-b border-border/40">{children}</td>
                          ),
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="rounded-2xl px-4 py-2.5 bg-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            {error && (
              <div className="text-sm text-destructive text-center p-3 bg-destructive/10 rounded-lg">
                {error.message}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t px-8 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your feedback data… (Enter to send, Shift+Enter for new line)"
            className="resize-none min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="icon" className="shrink-0 h-11 w-11">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
