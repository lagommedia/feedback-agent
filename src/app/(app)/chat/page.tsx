'use client'

import { useChat, type Message } from 'ai/react'
import { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  Trash2,
  MessageSquare,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import { v4 as uuidv4 } from 'uuid'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatSession {
  id: string
  userEmail: string
  title: string
  createdAt: string
  updatedAt: string
}

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

// ─── Session group helper ─────────────────────────────────────────────────────

function groupSessions(sessions: ChatSession[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 6 * 86400000)

  const groups: { label: string; items: ChatSession[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This Week', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const s of sessions) {
    const d = new Date(s.updatedAt)
    if (d >= today) groups[0].items.push(s)
    else if (d >= yesterday) groups[1].items.push(s)
    else if (d >= weekAgo) groups[2].items.push(s)
    else groups[3].items.push(s)
  }

  return groups.filter((g) => g.items.length > 0)
}

// ─── Starter questions ────────────────────────────────────────────────────────

const STARTER_QUESTIONS = [
  'What are the most common issues this week?',
  'Which customers are experiencing the most problems?',
  'Show me all high-urgency churn risk items as a table.',
  'What features are customers requesting most? Show me a chart.',
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Keep a ref so the useChat body getter always sees the latest sessionId
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = activeSessionId

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: '/api/chat',
    body: { sessionId: sessionIdRef.current },
    id: activeSessionId ?? 'default',
  })

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const userScrolledUpRef = useRef(false)

  // ─── Load sessions on mount ──────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // ─── Auto-scroll ─────────────────────────────────────────────────────────────

  // Track whether the user has scrolled up manually
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    function onScroll() {
      const el = messagesContainerRef.current
      if (!el) return
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUpRef.current = distFromBottom > 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll to bottom on new messages, but only if user hasn't scrolled up
  useEffect(() => {
    if (userScrolledUpRef.current) return
    const el = messagesContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  // Always scroll to bottom when a new session is selected or chat is cleared
  function scrollToBottom() {
    userScrolledUpRef.current = false
    const el = messagesContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  // Refresh sessions list after each completed AI response (for title updates)
  useEffect(() => {
    if (!isLoading && activeSessionId) {
      loadSessions()
    }
  }, [isLoading, activeSessionId, loadSessions])

  // ─── New chat ─────────────────────────────────────────────────────────────────

  async function handleNewChat() {
    const res = await fetch('/api/chat/sessions', { method: 'POST' })
    if (!res.ok) return
    const session: ChatSession = await res.json()
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(session.id)
    setMessages([])
  }

  // ─── Select session ───────────────────────────────────────────────────────────

  async function handleSelectSession(session: ChatSession) {
    setActiveSessionId(session.id)
    // Load messages for this session
    const res = await fetch(`/api/chat/sessions/${session.id}`)
    if (!res.ok) { setMessages([]); return }
    const dbMessages = await res.json()
    // Convert DB messages to useChat Message format
    const chatMessages: Message[] = dbMessages.map((m: { id: string; role: string; content: string }) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
    setMessages(chatMessages)
    setTimeout(scrollToBottom, 50)
  }

  // ─── Delete session ───────────────────────────────────────────────────────────

  async function handleDeleteSession(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation()
    setDeletingId(sessionId)
    try {
      await fetch(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' })
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
        setMessages([])
        scrollToBottom()
      }
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Send message — ensure session exists first ───────────────────────────────

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    let sid = activeSessionId
    if (!sid) {
      // Create a session on first message
      const res = await fetch('/api/chat/sessions', { method: 'POST' })
      if (res.ok) {
        const session: ChatSession = await res.json()
        setSessions((prev) => [session, ...prev])
        setActiveSessionId(session.id)
        sessionIdRef.current = session.id
        sid = session.id
      }
    }

    handleSubmit(e)
  }

  // ─── Keyboard shortcut ────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) {
        handleSend(e as unknown as React.FormEvent<HTMLFormElement>)
      }
    }
  }

  // ─── Starter question click ───────────────────────────────────────────────────

  function handleStarterClick(question: string) {
    handleInputChange({ target: { value: question } } as React.ChangeEvent<HTMLTextAreaElement>)
    setTimeout(() => {
      textareaRef.current?.form?.requestSubmit()
    }, 50)
  }

  const sessionGroups = groupSessions(sessions)

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sessions sidebar ── */}
      <aside className="w-64 shrink-0 border-r flex flex-col bg-muted/20">
        <div className="px-3 py-3 border-b shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-2 py-2">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 px-2">
                No chats yet. Start a new conversation!
              </p>
            ) : (
              sessionGroups.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                    {group.label}
                  </p>
                  {group.items.map((session) => (
                    <button
                      key={session.id}
                      onClick={() => handleSelectSession(session)}
                      className={`w-full group flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors text-sm ${
                        activeSessionId === session.id
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      <span className="flex-1 truncate text-xs leading-snug">{session.title}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDeleteSession(e as unknown as React.MouseEvent, session.id) }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all"
                        title="Delete conversation"
                      >
                        {deletingId === session.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* ── Main chat area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="border-b px-8 py-4 shrink-0">
          <h1 className="text-xl font-bold">AI Chat</h1>
          <p className="text-sm text-muted-foreground">
            Ask questions about your product feedback data
          </p>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
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
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t px-8 py-4 shrink-0">
          <form onSubmit={handleSend} className="max-w-2xl mx-auto flex gap-2">
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
    </div>
  )
}
