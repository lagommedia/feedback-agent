'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { useSyncContext } from '@/components/layout/sync-context'

const LOGOS: Record<string, string> = {
  'Anthropic AI': 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=64',
  'Avoma':        'https://www.google.com/s2/favicons?domain=avoma.com&sz=64',
  'Front':        'https://www.google.com/s2/favicons?domain=front.com&sz=64',
  'Slack':        'https://www.google.com/s2/favicons?domain=slack.com&sz=64',
  'Chargebee':    'https://www.google.com/s2/favicons?domain=chargebee.com&sz=64',
}

export default function IntegrationsPage() {
  const { states, anthropicConfigured, refreshConfig, syncSource } = useSyncContext()

  const [avoma, setAvoma] = useState({ apiKey: '', instructions: '' })
  const [front, setFront] = useState({ bearerToken: '', instructions: '', internalEmails: '', inboxIds: '' })
  const [slack, setSlack] = useState({ botToken: '', channelIds: '', instructions: '' })
  const [anthropic, setAnthropic] = useState({ apiKey: '', instructions: '', productInstructions: '', serviceInstructions: '', churnInstructions: '' })
  const [chargebee, setChargebee] = useState({ apiKey: '', site: '', instructions: '' })
  const [churnRiskScore, setChurnRiskScore] = useState({ instructions: '' })
  const [chargebeeSyncing, setChargebeeSyncing] = useState(false)
  const [chargebeeLastSynced, setChargebeeLastSynced] = useState<string | undefined>()
  const [normalizing, setNormalizing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [computingScores, setComputingScores] = useState(false)
  const [lastChurnScoredAt, setLastChurnScoredAt] = useState<string | undefined>()

  // Load existing config on mount — masked keys are loaded into state so
  // status checks work and Sync buttons stay enabled without re-entering keys.
  useEffect(() => {
    fetch('/api/integrations/config')
      .then((r) => r.json())
      .then(({ config }) => {
        if (config?.avoma) {
          setAvoma((s) => ({
            ...s,
            apiKey: config.avoma.apiKey ?? s.apiKey,
            instructions: config.avoma.instructions ?? s.instructions,
          }))
        }
        if (config?.front) {
          setFront((s) => ({
            ...s,
            bearerToken: config.front.bearerToken ?? s.bearerToken,
            instructions: config.front.instructions ?? s.instructions,
            internalEmails: (config.front.internalEmails ?? []).join('\n'),
            inboxIds: (config.front.inboxIds ?? []).join('\n'),
          }))
        }
        if (config?.slack) {
          setSlack((s) => ({
            ...s,
            botToken: config.slack.botToken ?? s.botToken,
            instructions: config.slack.instructions ?? s.instructions,
            channelIds: (config.slack.channelIds ?? []).join('\n'),
          }))
        }
        if (config?.anthropic) {
          setAnthropic((s) => ({
            ...s,
            apiKey: config.anthropic.apiKey ?? s.apiKey,
            instructions: config.anthropic.instructions ?? s.instructions,
            productInstructions: config.anthropic.productInstructions ?? s.productInstructions,
            serviceInstructions: config.anthropic.serviceInstructions ?? s.serviceInstructions,
            churnInstructions: config.anthropic.churnInstructions ?? s.churnInstructions,
          }))
        }
        if (config?.chargebee) {
          setChargebee((s) => ({
            ...s,
            apiKey: config.chargebee.apiKey ?? s.apiKey,
            site: config.chargebee.site ?? s.site,
            instructions: config.chargebee.instructions ?? s.instructions,
          }))
          setChargebeeLastSynced(config.chargebee.lastSyncedAt)
        }
        if (config?.churnRiskScore) {
          setChurnRiskScore((s) => ({
            ...s,
            instructions: config.churnRiskScore!.instructions ?? s.instructions,
          }))
        }
      })
      .catch(() => {/* silent */})

    // Load last churn score timestamp
    fetch('/api/churn-scores')
      .then(r => r.json())
      .then(({ scores }: { scores?: Record<string, { scoredAt: string }> }) => {
        if (!scores) return
        const times = Object.values(scores).map(s => s.scoredAt).filter(Boolean)
        if (times.length > 0) setLastChurnScoredAt([...times].sort().at(-1))
      })
      .catch(() => {/* silent */})
  }, [])

  // Masked keys look like ****abcd — send '' so the backend keeps the stored value.
  function unmasked(value: string): string {
    return value.startsWith('****') ? '' : value
  }

  async function saveConfig(
    integration: string,
    config: Record<string, string | string[]>,
  ) {
    setSaving(integration)
    try {
      const res = await fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration, config }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(`${integration.charAt(0).toUpperCase() + integration.slice(1)} saved.`)
      await refreshConfig()
    } catch (err) {
      toast.error(`Failed to save: ${String(err)}`)
    } finally {
      setSaving(null)
    }
  }

  async function normalizeCustomerNames() {
    setNormalizing(true)
    try {
      const res = await fetch('/api/chargebee/normalize', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Normalization failed')
      if (data.updated === 0) {
        toast.success('All customer names already match Chargebee.')
      } else {
        toast.success(`Normalized ${data.updated} feedback item${data.updated !== 1 ? 's' : ''} to use Chargebee company names.`)
      }
    } catch (err) {
      toast.error(`Normalization failed: ${String(err)}`)
    } finally {
      setNormalizing(false)
    }
  }

  async function computeChurnScores() {
    if (!churnRiskScore.instructions.trim()) {
      toast.error('Add scoring instructions and save them before computing scores.')
      return
    }
    setComputingScores(true)
    try {
      const res = await fetch('/api/churn-scores/compute', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Computation failed')
      toast.success(`Churn scores computed for ${data.scored} compan${data.scored !== 1 ? 'ies' : 'y'}`)
      setLastChurnScoredAt(new Date().toISOString())
    } catch (err) {
      toast.error(`Churn score computation failed: ${String(err)}`)
    } finally {
      setComputingScores(false)
    }
  }

  async function syncChargebee() {
    setChargebeeSyncing(true)
    try {
      const res = await fetch('/api/integrations/chargebee/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error([data.error, data.cause].filter(Boolean).join(' — '))
      toast.success(`Chargebee synced — ${data.count} active customers imported`)
      setChargebeeLastSynced(new Date().toISOString())
    } catch (err) {
      toast.error(`Chargebee sync failed: ${String(err)}`)
    } finally {
      setChargebeeSyncing(false)
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleString()
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect your tools to start ingesting product feedback automatically.
        </p>
      </div>

      <div className="space-y-6">
        {/* Anthropic AI */}
        <IntegrationCard
          name="Anthropic AI"
          description="The AI engine that analyzes all your feedback data, extracts insights, and powers the chat and reports."
          status={anthropicConfigured}
          badge="Required"
          badgeVariant="destructive"
          onSave={() => saveConfig('anthropic', {
            apiKey: unmasked(anthropic.apiKey),
            instructions: anthropic.instructions,
            productInstructions: anthropic.productInstructions,
            serviceInstructions: anthropic.serviceInstructions,
            churnInstructions: anthropic.churnInstructions,
          })}
          saving={saving === 'anthropic'}
        >
          <div>
            <Label htmlFor="anthropic-key">API Key</Label>
            <Input
              id="anthropic-key"
              type="password"
              placeholder="sk-ant-..."
              value={anthropic.apiKey}
              onChange={(e) => setAnthropic((s) => ({ ...s, apiKey: e.target.value }))}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Get your API key from <span className="font-mono">console.anthropic.com</span>
            </p>
          </div>

          <div className="space-y-4 pt-1">
            <div>
              <Label htmlFor="anthropic-global-instructions" className="text-sm font-medium">
                Global AI Instructions
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
                Applied to all analysis across every data source and category. Use this for universal rules.
              </p>
              <textarea
                id="anthropic-global-instructions"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
                placeholder="E.g. 'Exclude all internal calls and conversations. Only extract feedback from interactions with external customers. Ignore recruiting calls, team syncs, and internal Slack messages.'"
                value={anthropic.instructions}
                onChange={(e) => setAnthropic((s) => ({ ...s, instructions: e.target.value }))}
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Instructions by Feedback Category</p>
              <p className="text-xs text-muted-foreground mb-3">
                Tell the AI how to classify feedback into each category. These apply on top of the global instructions above.
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="anthropic-product-instructions" className="text-xs font-medium text-indigo-400">
                    Product Feedback Instructions
                  </Label>
                  <textarea
                    id="anthropic-product-instructions"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
                    placeholder="E.g. 'Classify as Product Feedback when the customer is commenting on software features, UI/UX, bugs, or requesting new product functionality.'"
                    value={anthropic.productInstructions}
                    onChange={(e) => setAnthropic((s) => ({ ...s, productInstructions: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="anthropic-service-instructions" className="text-xs font-medium text-teal-400">
                    Service Feedback Instructions
                  </Label>
                  <textarea
                    id="anthropic-service-instructions"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
                    placeholder="E.g. 'Classify as Service Feedback when the customer is commenting on the quality of support, onboarding, response times, or their Zeni rep.'"
                    value={anthropic.serviceInstructions}
                    onChange={(e) => setAnthropic((s) => ({ ...s, serviceInstructions: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="anthropic-churn-instructions" className="text-xs font-medium text-red-400">
                    Churn Risk Instructions
                  </Label>
                  <textarea
                    id="anthropic-churn-instructions"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px] resize-y"
                    placeholder="E.g. 'Classify as Churn Risk when the customer expresses frustration severe enough to cancel, mentions a competitor, or signals they may leave Zeni.'"
                    value={anthropic.churnInstructions}
                    onChange={(e) => setAnthropic((s) => ({ ...s, churnInstructions: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </IntegrationCard>

        {/* Churn Risk Score */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
                <span className="text-red-400 text-sm font-bold">%</span>
              </div>
              <div>
                <CardTitle className="text-base">Churn Risk Score</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Define how the AI should calculate a churn risk score (0–100) for each company based on their feedback history.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="churn-risk-instructions">Scoring Instructions</Label>
              <textarea
                id="churn-risk-instructions"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[140px] resize-y"
                placeholder={`E.g. 'Score each company 0–100 based on their feedback:\n• Start at 0\n• +30 for each high-urgency issue\n• +20 for churn_risk appType items\n• +10 for any unresolved issues older than 30 days\n• -10 for each recent praise\n• Cap at 100. Flag anything above 60 as high risk.'`}
                value={churnRiskScore.instructions}
                onChange={(e) => setChurnRiskScore((s) => ({ ...s, instructions: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                These instructions tell the AI how to weight issues, urgency, churn signals, and praises when computing a risk score per company.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="sm"
                onClick={async () => {
                  setSaving('churnRiskScore')
                  try {
                    const res = await fetch('/api/integrations/config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        integration: 'churnRiskScore',
                        config: { instructions: churnRiskScore.instructions },
                      }),
                    })
                    if (!res.ok) throw new Error(await res.text())
                    toast.success('Churn Risk Score instructions saved.')
                  } catch (err) {
                    toast.error(`Failed to save: ${String(err)}`)
                  } finally {
                    setSaving(null)
                  }
                }}
                disabled={saving === 'churnRiskScore'}
              >
                {saving === 'churnRiskScore' ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                Save Instructions
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={computeChurnScores}
                disabled={computingScores}
              >
                {computingScores ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Computing...</>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Compute Scores
                  </>
                )}
              </Button>
              {lastChurnScoredAt && (
                <p className="text-xs text-muted-foreground">
                  Last scored: {new Date(lastChurnScoredAt).toLocaleString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Avoma */}
        <IntegrationCard
          name="Avoma"
          description="Customer call recordings and transcripts. AI will read these to identify issues and praises from customer conversations."
          status={states.avoma.configured}
          lastSyncedAt={formatDate(states.avoma.lastSyncedAt)}
          syncing={states.avoma.syncing}
          analyzing={states.avoma.analyzing}
          error={states.avoma.error}
          instructions={avoma.instructions}
          instructionsPlaceholder="E.g. 'Only extract feedback from external customer calls. Ignore internal team syncs and recruiting calls.'"
          onInstructionsChange={(v) => setAvoma((s) => ({ ...s, instructions: v }))}
          onSave={() => saveConfig('avoma', { apiKey: unmasked(avoma.apiKey), instructions: avoma.instructions })}
          onSync={() => syncSource('avoma')}
          saving={saving === 'avoma'}
        >
          <div>
            <Label htmlFor="avoma-key">API Key</Label>
            <Input
              id="avoma-key"
              type="password"
              placeholder="Your Avoma API key"
              value={avoma.apiKey}
              onChange={(e) => setAvoma((s) => ({ ...s, apiKey: e.target.value }))}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Find your API key in Avoma → Settings → Integrations → API
            </p>
          </div>
        </IntegrationCard>

        {/* Front */}
        <IntegrationCard
          name="Front"
          description="Customer email communications between your clients and Zeni representatives. Surfaces issues and praises from email threads."
          status={states.front.configured}
          lastSyncedAt={formatDate(states.front.lastSyncedAt)}
          syncing={states.front.syncing}
          analyzing={states.front.analyzing}
          error={states.front.error}
          instructions={front.instructions}
          instructionsPlaceholder="E.g. 'Only extract feedback about the Zeni software product. Ignore billing disputes and general account inquiries.'"
          onInstructionsChange={(v) => setFront((s) => ({ ...s, instructions: v }))}
          onSave={() => saveConfig('front', {
            bearerToken: unmasked(front.bearerToken),
            instructions: front.instructions,
            internalEmails: front.internalEmails.split('\n').map((s) => s.trim()).filter(Boolean),
            inboxIds: front.inboxIds.split('\n').map((s) => s.trim()).filter(Boolean),
          })}
          onSync={() => syncSource('front')}
          saving={saving === 'front'}
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="front-token">Bearer Token</Label>
              <Input
                id="front-token"
                type="password"
                placeholder="Your Front API bearer token"
                value={front.bearerToken}
                onChange={(e) => setFront((s) => ({ ...s, bearerToken: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Generate a token in Front → Settings → Developers → API tokens
              </p>
            </div>
            <div>
              <Label htmlFor="front-inbox-ids">Exclude Inbox IDs (one per line)</Label>
              <textarea
                id="front-inbox-ids"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] font-mono"
                placeholder={"inb_abc123\ninb_def456"}
                value={front.inboxIds}
                onChange={(e) => setFront((s) => ({ ...s, inboxIds: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                <strong>Optional.</strong> Conversations from these inboxes will be excluded (e.g. internal ops, billing). Leave blank to sync all inboxes. Find IDs in Front → Settings → Inboxes → click an inbox → copy the ID from the URL.
              </p>
            </div>
            <div>
              <Label htmlFor="front-internal-emails">Internal Rep Emails to Exclude (one per line)</Label>
              <textarea
                id="front-internal-emails"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] font-mono"
                placeholder={"alice@zeni.ai\nbob@zeni.ai\ncarol@usezeni.ai"}
                value={front.internalEmails}
                onChange={(e) => setFront((s) => ({ ...s, internalEmails: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Conversations where the recipient is one of these addresses will be excluded from sync. Useful for filtering out sales and BDR rep email threads.
              </p>
            </div>
          </div>
        </IntegrationCard>

        {/* Chargebee */}
        <IntegrationCard
          name="Chargebee"
          description="Subscription billing and customer data. Pull in active customers with MRR/ARR to power the company filter and enrich every feedback item with revenue context."
          status={!!chargebee.site && !!chargebee.apiKey}
          lastSyncedAt={formatDate(chargebeeLastSynced)}
          syncing={chargebeeSyncing}
          instructions={chargebee.instructions}
          instructionsPlaceholder="E.g. 'Flag customers who are on trial or have a past-due invoice as higher churn risk when their feedback is negative.'"
          onInstructionsChange={(v) => setChargebee((s) => ({ ...s, instructions: v }))}
          onSave={() => saveConfig('chargebee', {
            apiKey: unmasked(chargebee.apiKey),
            site: chargebee.site,
            instructions: chargebee.instructions,
          })}
          onSync={syncChargebee}
          saving={saving === 'chargebee'}
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="chargebee-site">Site Name</Label>
              <Input
                id="chargebee-site"
                placeholder="your-company"
                value={chargebee.site}
                onChange={(e) => setChargebee((s) => ({ ...s, site: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The subdomain of your Chargebee account — e.g. <span className="font-mono">your-company</span> from <span className="font-mono">your-company.chargebee.com</span>
              </p>
            </div>
            <div>
              <Label htmlFor="chargebee-key">API Key</Label>
              <Input
                id="chargebee-key"
                type="password"
                placeholder="Your Chargebee API key"
                value={chargebee.apiKey}
                onChange={(e) => setChargebee((s) => ({ ...s, apiKey: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find your API key in Chargebee → Settings → Configure Chargebee → API Keys
              </p>
            </div>
          </div>

          {/* Normalize customer names */}
          {chargebeeLastSynced && (
            <div className="rounded-md border border-border bg-muted/20 p-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Normalize Customer Names</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Match existing feedback customer names to Chargebee's canonical company names using fuzzy matching. Run this after each sync.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={normalizeCustomerNames}
                disabled={normalizing}
                className="shrink-0"
              >
                {normalizing ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Normalizing...</>
                ) : (
                  'Normalize Names'
                )}
              </Button>
            </div>
          )}
        </IntegrationCard>

        {/* Slack */}
        <IntegrationCard
          name="Slack"
          description="Internal communication between Zeni representatives and the product team about customer issues."
          status={states.slack.configured}
          lastSyncedAt={formatDate(states.slack.lastSyncedAt)}
          syncing={states.slack.syncing}
          analyzing={states.slack.analyzing}
          error={states.slack.error}
          warning="For best performance, install Slack as an internal custom app (not a distributed Marketplace app). This gives Tier 3 rate limits (50+ req/min) instead of Tier 1 (1 req/min)."
          instructions={slack.instructions}
          instructionsPlaceholder="E.g. 'Focus on messages that mention specific product bugs or feature requests. Ignore off-topic conversations.'"
          onInstructionsChange={(v) => setSlack((s) => ({ ...s, instructions: v }))}
          onSave={() =>
            saveConfig('slack', {
              botToken: unmasked(slack.botToken),
              channelIds: slack.channelIds.split('\n').map((s) => s.trim()).filter(Boolean),
              instructions: slack.instructions,
            })
          }
          onSync={() => syncSource('slack')}
          saving={saving === 'slack'}
        >
          <div className="space-y-3">
            <div>
              <Label htmlFor="slack-token">Bot Token</Label>
              <Input
                id="slack-token"
                type="password"
                placeholder="xoxb-..."
                value={slack.botToken}
                onChange={(e) => setSlack((s) => ({ ...s, botToken: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Create a Slack app at api.slack.com → OAuth & Permissions → Bot Token
              </p>
            </div>
            <div>
              <Label htmlFor="slack-channels">Channel IDs (one per line)</Label>
              <textarea
                id="slack-channels"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] font-mono"
                placeholder={"C1234567890\nC0987654321"}
                value={slack.channelIds}
                onChange={(e) => setSlack((s) => ({ ...s, channelIds: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Channel IDs start with C. Find them by right-clicking a channel → View channel details.
              </p>
            </div>
          </div>
        </IntegrationCard>
      </div>
    </div>
  )
}

interface IntegrationCardProps {
  name: string
  description: string
  status: boolean
  badge?: string
  badgeVariant?: 'default' | 'destructive' | 'secondary' | 'outline'
  lastSyncedAt?: string
  syncing?: boolean
  analyzing?: boolean
  error?: string
  warning?: string
  instructions?: string
  instructionsPlaceholder?: string
  onInstructionsChange?: (v: string) => void
  onSave: () => void
  onSync?: () => void
  saving: boolean
  children: React.ReactNode
}

function IntegrationCard({
  name,
  description,
  status,
  badge,
  badgeVariant = 'secondary',
  lastSyncedAt,
  syncing,
  analyzing,
  error,
  warning,
  instructions,
  instructionsPlaceholder,
  onInstructionsChange,
  onSave,
  onSync,
  saving,
  children,
}: IntegrationCardProps) {
  const showInstructions = onInstructionsChange !== undefined
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <img
            src={LOGOS[name]}
            alt={`${name} logo`}
            width={28}
            height={28}
            className="rounded mt-0.5 shrink-0"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{name}</CardTitle>
              {badge && <Badge variant={badgeVariant}>{badge}</Badge>}
              {status ? (
                <Badge variant="outline" className="text-green-600 border-green-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  <XCircle className="w-3 h-3 mr-1" />
                  Not configured
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {warning && (
          <div className="flex gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{warning}</p>
          </div>
        )}

        {children}

        {/* Per-integration AI instructions */}
        {showInstructions && (
          <div>
            <Label htmlFor={`${name}-instructions`} className="text-sm font-medium">
              AI Instructions
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
              Tell the AI how to interpret and filter data from this source.
            </p>
            <textarea
              id={`${name}-instructions`}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
              placeholder={instructionsPlaceholder}
              value={instructions ?? ''}
              onChange={(e) => onInstructionsChange!(e.target.value)}
            />
          </div>
        )}

        {error && (
          <div className="flex gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            <Button onClick={onSave} disabled={saving} size="sm">
              {saving ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
            {onSync && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSync}
                disabled={!status || syncing || analyzing}
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Syncing...
                  </>
                ) : analyzing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Sync Now
                  </>
                )}
              </Button>
            )}
          </div>
          {lastSyncedAt && (
            <p className="text-xs text-muted-foreground">Last synced: {lastSyncedAt}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
