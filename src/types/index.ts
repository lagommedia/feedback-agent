// ─── Integration Config ───────────────────────────────────────────────────────

export interface IntegrationConfig {
  avoma?: {
    apiKey: string
    lastSyncedAt?: string
    instructions?: string
  }
  front?: {
    bearerToken: string
    lastSyncedAt?: string
    instructions?: string
    internalEmails?: string[]
    inboxIds?: string[]
  }
  slack?: {
    botToken: string
    channelIds: string[]
    lastSyncedAt?: string
    instructions?: string
  }
  anthropic?: {
    apiKey: string
    instructions?: string
    productInstructions?: string
    serviceInstructions?: string
    churnInstructions?: string
  }
}

// ─── Raw Data Shapes ──────────────────────────────────────────────────────────

export interface AvomaRawMeeting {
  uuid: string
  subject: string          // Avoma API returns "subject", not "title"
  start_at: string
  end_at: string
  attendees: Array<{ email: string; name: string; uuid?: string; response_status?: string }>
  transcript_ready: boolean
  transcription_uuid: string | null
  is_internal: boolean
  audio_ready: boolean
}

export interface AvomaRawTranscript {
  meetingUuid: string
  meetingTitle: string
  attendees: Array<{ email: string; name: string }>
  date: string
  segments: Array<{
    speaker: string
    text: string
    start_time: number
  }>
}

export interface AvomaRawData {
  fetchedAt: string
  meetings: AvomaRawMeeting[]
  transcripts: AvomaRawTranscript[]
}

export interface FrontRawConversation {
  id: string
  subject: string
  status: string
  created_at: number
  updated_at: number
  assignee?: { email: string; first_name: string; last_name: string }
  recipient?: { handle: string; name: string }
  tags: Array<{ name: string }>
}

export interface FrontRawMessage {
  id: string
  conversationId: string
  type: string
  is_inbound: boolean
  created_at: number
  author?: { email: string; first_name: string; last_name: string }
  body: string
  text: string
}

export interface FrontRawData {
  fetchedAt: string
  conversations: FrontRawConversation[]
  messages: FrontRawMessage[]
}

export interface SlackRawMessage {
  ts: string
  user: string
  username?: string
  text: string
  channel: string
  channelName?: string
}

export interface SlackRawData {
  fetchedAt: string
  channels: Array<{ id: string; name: string }>
  messages: SlackRawMessage[]
}

// ─── Structured Feedback Item ─────────────────────────────────────────────────

export type FeedbackSource = 'avoma' | 'front' | 'slack'
export type FeedbackType = 'issue' | 'praise' | 'feature_request'
export type UrgencyLevel = 'low' | 'medium' | 'high'
export type AppType = 'product' | 'service' | 'churn_risk'

export const APP_TYPES: Record<AppType, string> = {
  product: 'Product Feedback',
  service: 'Service Feedback',
  churn_risk: 'Churn Risk',
}

export const PRODUCT_TAGS = [
  'Dashboard',
  'Reports',
  'Bill Pay',
  'Reimbursements',
  'Checking / Debit',
  'Credit Cards',
  'Treasury',
  'Integrations',
  'AI CFO',
] as const

export const SERVICE_TAGS = [
  'Onboarding',
  'Account Management',
  'Bookkeeping Accuracy',
  'Month-End Close',
  'Tax Preparation',
  'Response Time',
  'Communication',
  'Escalation Handling',
  'Training & Enablement',
  'Billing & Invoicing',
] as const

export const CHURN_TAGS = [
  'Pricing / Cost',
  'Missing Features',
  'Competitor Mention',
  'Bookkeeping Errors',
  'Slow Response',
  'Lack of Value',
  'Leadership / Team Change',
  'Contract / Renewal Risk',
  'Support Dissatisfaction',
  'Switching Intent',
] as const

export type ProductTag = (typeof PRODUCT_TAGS)[number]
export type ServiceTag = (typeof SERVICE_TAGS)[number]
export type ChurnTag = (typeof CHURN_TAGS)[number]

export const TAGS_BY_APP_TYPE: Record<AppType, readonly string[]> = {
  product: PRODUCT_TAGS,
  service: SERVICE_TAGS,
  churn_risk: CHURN_TAGS,
}

export type WorkflowStatus = 'reviewed' | 'action_plan' | 'in_progress' | 'completed'

export interface ActionItem {
  id: string
  text: string
  checked: boolean
}

export interface FeedbackItem {
  id: string
  source: FeedbackSource
  type: FeedbackType
  appType?: AppType   // defaults to 'product' if undefined (backward compat)
  title: string
  description: string
  urgency: UrgencyLevel
  customer: string
  rep: string
  date: string
  tags: string[]
  rawSourceId: string
  analyzedAt: string
  assignedTo?: string       // user email
  workflowStatus?: WorkflowStatus
  reviewedNotes?: string
  actionItems?: ActionItem[]
}

export interface FeedbackStore {
  lastAnalyzedAt: string
  items: FeedbackItem[]
}

// ─── API Request/Response Shapes ─────────────────────────────────────────────

export interface SaveConfigRequest {
  integration: keyof IntegrationConfig
  config: IntegrationConfig[keyof IntegrationConfig]
}

export interface SyncResult {
  source: FeedbackSource
  status: 'success' | 'error'
  count: number
  error?: string
}

export interface AnalyzeResult {
  newItems: number
  totalItems: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ReportRequest {
  type: 'weekly_summary' | 'issues_deep_dive' | 'praises' | 'feature_requests' | 'custom'
  customPrompt?: string
  dateRange?: { from: string; to: string }
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DashboardStats {
  total: number
  byType: Record<FeedbackType, number>
  bySource: Record<FeedbackSource, number>
  byUrgency: Record<UrgencyLevel, number>
  recentItems: FeedbackItem[]
}

// ─── Feedback Filters ─────────────────────────────────────────────────────────

export interface FeedbackFilters {
  source?: FeedbackSource[]
  type?: FeedbackType[]
  urgency?: UrgencyLevel[]
  tags?: string[]
  search?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}
