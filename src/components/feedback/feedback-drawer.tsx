'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, AlertCircle, ThumbsUp, Lightbulb, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { FeedbackItem, FeedbackType, UrgencyLevel, AppType } from '@/types'

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  'Dashboard':        { bg: 'rgba(123,97,255,0.15)', text: '#9B7FFF' },
  'Reports':          { bg: 'rgba(0,150,255,0.15)',  text: '#4BAAFF' },
  'Bill Pay':         { bg: 'rgba(255,184,0,0.15)',  text: '#FFB800' },
  'Reimbursements':   { bg: 'rgba(255,80,0,0.15)',   text: '#FF7040' },
  'Checking / Debit': { bg: 'rgba(0,200,210,0.15)',  text: '#00C8D2' },
  'Credit Cards':     { bg: 'rgba(180,100,255,0.15)', text: '#C47FFF' },
  'Treasury':         { bg: 'rgba(0,200,5,0.15)',    text: '#00C805' },
  'Integrations':     { bg: 'rgba(255,100,130,0.15)', text: '#FF6482' },
  'AI CFO':           { bg: 'rgba(0,212,255,0.15)',  text: '#00D4FF' },
}

function typeIcon(type: FeedbackType) {
  if (type === 'issue') return <AlertCircle className="w-4 h-4" style={{ color: '#FF5000' }} />
  if (type === 'praise') return <ThumbsUp className="w-4 h-4" style={{ color: '#00C805' }} />
  return <Lightbulb className="w-4 h-4" style={{ color: '#FFB800' }} />
}

function urgencyBadgeClass(urgency: UrgencyLevel) {
  if (urgency === 'high') return 'bg-destructive/20 text-destructive'
  if (urgency === 'medium') return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-muted text-muted-foreground'
}

interface FeedbackDrawerProps {
  item: FeedbackItem | null
  open: boolean
  onClose: () => void
  onTrained?: (id: string, action: string, targetType?: string) => void
}

export function FeedbackDrawer({ item, open, onClose, onTrained }: FeedbackDrawerProps) {
  const [feedbackText, setFeedbackText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Train Classifier state
  const [trainAction, setTrainAction] = useState('')
  const [trainNotes, setTrainNotes] = useState('')
  const [trainSaving, setTrainSaving] = useState(false)

  // Reset state when a new item is opened
  useEffect(() => {
    if (open) {
      setFeedbackText('')
      setSaved(false)
      setTrainAction('')
      setTrainNotes('')
      setTrainSaving(false)
    }
  }, [open, item?.id])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function handleSave() {
    if (!item || !feedbackText.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/feedback/instruction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, feedbackText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setSaved(true)
      toast.success('Instruction added to AI settings')
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleTraining() {
    if (!item || !trainAction || !trainNotes.trim()) return
    const [action, targetType] = trainAction.split(':')
    setTrainSaving(true)
    try {
      const res = await fetch(`/api/feedback/${item.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetType, notes: trainNotes }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to apply training')
        return
      }
      toast.success(action === 'remove' ? 'Item removed' : 'Item moved successfully')
      onTrained?.(item.id, action, targetType)
      onClose()
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setTrainSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-background border-l border-border shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold">Feedback Actions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Send feedback to AI or train the classifier for this item.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {item && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Ticket summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">{typeIcon(item.type)}</div>
                <p className="text-sm font-medium leading-snug">{item.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium mt-0.5">{item.customer}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Zeni Rep</p>
                  <p className="font-medium mt-0.5">{item.rep}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium mt-0.5 capitalize">{item.type.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Urgency</p>
                  <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${urgencyBadgeClass(item.urgency)}`}>
                    {item.urgency}
                  </span>
                </div>
              </div>

              {(item.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
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
              )}

              <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
                {item.description}
              </p>
            </div>

            {/* Send Feedback to AI */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Send Feedback to AI</p>
              <p className="text-xs text-muted-foreground">
                Describe how the AI should handle this type of feedback — e.g. how to categorize it, what urgency to assign, or what to watch for in future tickets.
              </p>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="E.g. 'When customers report iOS crashes related to expense approval, always mark these as high urgency and tag Reimbursements. These tend to be renewal risks.'"
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                disabled={saved}
              />
              {saved ? (
                <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/20 text-sm text-green-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Instruction added to Anthropic AI settings. It will apply on the next sync.</span>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving || !feedbackText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Formatting with Claude...
                      </>
                    ) : (
                      'Save to AI Instructions'
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Train Classifier */}
            <div className="pt-4 border-t border-border/60 space-y-2">
              <p className="text-sm font-medium">Train Classifier</p>
              <p className="text-xs text-muted-foreground">
                Move this item to a different feedback category or remove it if it{"'"}s not useful.
              </p>
              <select
                value={trainAction}
                onChange={(e) => setTrainAction(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:dark]"
              >
                <option value="">Select an action…</option>
                <option value="remove">Remove — not useful feedback</option>
                <option value="move:product">Move to Product Feedback</option>
                <option value="move:service">Move to Service Feedback</option>
                <option value="move:churn_risk">Move to Churn Risk</option>
              </select>
              {trainAction && (
                <>
                  <textarea
                    rows={2}
                    placeholder="Why? Your notes help train future classifications… (required)"
                    value={trainNotes}
                    onChange={(e) => setTrainNotes(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none [color-scheme:dark]"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleTraining}
                      disabled={trainSaving || !trainNotes.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {trainSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Apply Training
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-end">
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}
