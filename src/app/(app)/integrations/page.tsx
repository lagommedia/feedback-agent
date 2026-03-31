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
}

export default function IntegrationsPage() {
  const { states, anthropicConfigured, refreshConfig, syncSource } = useSyncContext()

  const [avoma, setAvoma] = useState({ apiKey: '', instructions: '' })
  const [front, setFront] = useState({ bearerToken: '', instructions: '' })
  const [slack, setSlack] = useState({ botToken: '', channelIds: '', instructions: '' })
  const [anthropic, setAnthropic] = useState({ apiKey: '', instructions: '', productInstructions: '', serviceInstructions: '', churnInstructions: '' })
  const [saving, setSaving] = useState<string | null>(null)

  // Load existing instructions from saved config on mount
  useEffect(() => {
    fetch('/api/integrations/config')
      .then((r) => r.json())
      .then(({ config }) => {
        if (config?.avoma?.instructions) setAvoma((s) => ({ ...s, instructions: config.avoma.instructions }))
        if (config?.front?.instructions) setFront((s) => ({ ...s, instructions: config.front.instructions }))
        if (config?.slack?.instructions) setSlack((s) => ({ ...s, instructions: config.slack.instructions }))
        if (config?.anthropic) {
          setAnthropic((s) => ({
            ...s,
            instructions: config.anthropic.instructions ?? s.instructions,
            productInstructions: config.anthropic.productInstructions ?? s.productInstructions,
            serviceInstructions: config.anthropic.serviceInstructions ?? s.serviceInstructions,
            churnInstructions: config.anthropic.churnInstructions ?? s.churnInstructions,
          }))
        }
      })
      .catch(() => {/* silent */})
  }, [])

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
            apiKey: anthropic.apiKey,
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
          onSave={() => saveConfig('avoma', { apiKey: avoma.apiKey, instructions: avoma.instructions })}
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
          onSave={() => saveConfig('front', { bearerToken: front.bearerToken, instructions: front.instructions })}
          onSync={() => syncSource('front')}
          saving={saving === 'front'}
        >
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
              botToken: slack.botToken,
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
