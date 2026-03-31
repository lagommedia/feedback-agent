/**
 * Seed script — populates data/ with realistic dummy data for local development.
 * Run with:  npm run seed
 *
 * Safe to re-run at any time. Preserves your API keys in config.json.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), 'data')

async function write(filename: string, data: unknown) {
  await mkdir(DATA_DIR, { recursive: true })
  const filePath = path.join(DATA_DIR, filename)
  const tmp = filePath + '.tmp'
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, filePath)
  console.log(`  ✓ ${filename}`)
}

async function readConfig() {
  try {
    const raw = await readFile(path.join(DATA_DIR, 'config.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// ─── Dates ────────────────────────────────────────────────────────────────────

function daysAgo(n: number) {
  const d = new Date('2026-03-16')
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
function dateOnly(n: number) {
  return daysAgo(n).split('T')[0]
}

// ─── Avoma Raw ────────────────────────────────────────────────────────────────

const avomaRaw = {
  fetchedAt: daysAgo(0),
  meetings: [
    { uuid: 'avoma-m-001', subject: 'Zeni Onboarding — Acme Corp', start_at: daysAgo(2), end_at: daysAgo(2), transcript_ready: true, transcription_uuid: 'avoma-t-001', is_internal: false, audio_ready: true, attendees: [{ email: 'taylor@zeni.ai', name: 'Taylor Diamond' }, { email: 'cfo@acme.com', name: 'Rachel Kim' }] },
    { uuid: 'avoma-m-002', subject: 'QBR — Palo Alto Ventures', start_at: daysAgo(5), end_at: daysAgo(5), transcript_ready: true, transcription_uuid: 'avoma-t-002', is_internal: false, audio_ready: true, attendees: [{ email: 'mike.ko@zeni.ai', name: 'Mike Ko' }, { email: 'ops@paventures.com', name: 'James Nguyen' }] },
    { uuid: 'avoma-m-003', subject: 'Renewal Check-in — Sequoia Portfolio Co', start_at: daysAgo(8), end_at: daysAgo(8), transcript_ready: true, transcription_uuid: 'avoma-t-003', is_internal: false, audio_ready: true, attendees: [{ email: 'yan@zeni.ai', name: 'Yan Gao' }, { email: 'finance@sequoiaportco.com', name: 'Maria Lopez' }] },
    { uuid: 'avoma-m-004', subject: 'Product Feedback Session — RCT AI', start_at: daysAgo(10), end_at: daysAgo(10), transcript_ready: true, transcription_uuid: 'avoma-t-004', is_internal: false, audio_ready: true, attendees: [{ email: 'taylor@zeni.ai', name: 'Taylor Diamond' }, { email: 'jinghaoyang@rct.ai', name: 'Haoyang Jing' }] },
    { uuid: 'avoma-m-005', subject: 'Support Call — Magnalana', start_at: daysAgo(12), end_at: daysAgo(12), transcript_ready: true, transcription_uuid: 'avoma-t-005', is_internal: false, audio_ready: true, attendees: [{ email: 'malorie@zeni.ai', name: 'Malorie Pennie' }, { email: 'info@magnalana.com', name: 'Sandra Chen' }] },
  ],
  transcripts: [
    {
      meetingUuid: 'avoma-m-001',
      meetingTitle: 'Zeni Onboarding — Acme Corp',
      attendees: [{ email: 'taylor@zeni.ai', name: 'Taylor Diamond' }, { email: 'cfo@acme.com', name: 'Rachel Kim' }],
      date: daysAgo(2),
      segments: [
        { speaker: 'Taylor Diamond', text: 'Welcome Rachel, excited to have Acme on the platform. Walk me through how the onboarding has gone so far.', start_time: 0 },
        { speaker: 'Rachel Kim', text: 'Overall it\'s been good but we\'re running into issues with the bank feed sync. Our Wells Fargo account keeps disconnecting every few days and we have to re-authenticate. It\'s really disruptive to our workflow.', start_time: 15 },
        { speaker: 'Taylor Diamond', text: 'I\'m really sorry about that — we\'ve had a few reports of this. Our engineering team is actively working on a fix. What about the rest of the product?', start_time: 38 },
        { speaker: 'Rachel Kim', text: 'The categorization AI is honestly impressive. It correctly tagged about 90% of our transactions on the first pass which saved us a ton of manual work. But I really wish we could bulk-edit categories — right now we have to click into each transaction one at a time.', start_time: 55 },
        { speaker: 'Taylor Diamond', text: 'Bulk editing is actually on our near-term roadmap. You\'d be able to select multiple transactions and apply a category at once.', start_time: 82 },
        { speaker: 'Rachel Kim', text: 'That would be huge. Also, our external CPA needs read-only access to pull reports at month end but we don\'t want to give them full account access. Is there a guest or accountant role?', start_time: 95 },
        { speaker: 'Taylor Diamond', text: 'We have a limited sharing feature today but a full accountant portal is something we hear a lot. I\'ll flag it for the product team.', start_time: 120 },
      ],
    },
    {
      meetingUuid: 'avoma-m-002',
      meetingTitle: 'QBR — Palo Alto Ventures',
      attendees: [{ email: 'mike.ko@zeni.ai', name: 'Mike Ko' }, { email: 'ops@paventures.com', name: 'James Nguyen' }],
      date: daysAgo(5),
      segments: [
        { speaker: 'Mike Ko', text: 'James, let\'s do a quick review of the quarter. How has Zeni been performing for your team?', start_time: 0 },
        { speaker: 'James Nguyen', text: 'Honestly it\'s been transformative for our back office. We used to spend about 15 hours a month on bookkeeping and it\'s down to maybe 3. The automation is fantastic.', start_time: 12 },
        { speaker: 'Mike Ko', text: 'That\'s great to hear. Any pain points?', start_time: 35 },
        { speaker: 'James Nguyen', text: 'The biggest one is the month-end close report. It takes forever to load when we have a lot of transactions — sometimes 30-40 seconds. By the time it loads we\'re worried something crashed.', start_time: 42 },
        { speaker: 'James Nguyen', text: 'Also the mobile app crashes when I try to approve expenses. I\'m on iOS 17 and it just closes immediately after tapping approve.', start_time: 75 },
        { speaker: 'Mike Ko', text: 'Both of those are things I want to get in front of the team right away. The mobile crash especially, that\'s a blocking issue. Let me follow up with you this week once I hear back from engineering.', start_time: 92 },
        { speaker: 'James Nguyen', text: 'Appreciate it. Other than those two things we\'re very happy. We actually referred two other portfolio companies to you last week.', start_time: 115 },
        { speaker: 'Mike Ko', text: 'That means the world to us, thank you!', start_time: 130 },
      ],
    },
    {
      meetingUuid: 'avoma-m-003',
      meetingTitle: 'Renewal Check-in — Sequoia Portfolio Co',
      attendees: [{ email: 'yan@zeni.ai', name: 'Yan Gao' }, { email: 'finance@sequoiaportco.com', name: 'Maria Lopez' }],
      date: daysAgo(8),
      segments: [
        { speaker: 'Yan Gao', text: 'Maria, so glad we could connect. I know renewal is coming up next month — how are you feeling about the product?', start_time: 0 },
        { speaker: 'Maria Lopez', text: 'We\'re definitely renewing. Zeni has been a core part of our finance stack. But I do have a few requests before we sign for another year.', start_time: 15 },
        { speaker: 'Yan Gao', text: 'Of course, let\'s hear them.', start_time: 35 },
        { speaker: 'Maria Lopez', text: 'Number one — we need multi-entity support. We have three LLCs that we manage separately and right now we have to log into three separate Zeni accounts. It\'s really cumbersome. A consolidated view would be a game changer.', start_time: 40 },
        { speaker: 'Maria Lopez', text: 'Number two — the tax filing integration with TurboTax Business doesn\'t work for our use case. It exports to the wrong format and our CPA ends up having to manually reformat everything anyway.', start_time: 78 },
        { speaker: 'Yan Gao', text: 'Multi-entity is our most requested feature right now and I can tell you it\'s actively in development. No exact date but it\'s top of our roadmap. The TurboTax issue is something I want to loop in our tax team on.', start_time: 105 },
        { speaker: 'Maria Lopez', text: 'Great. Other than those two, the product is excellent. The burn rate tracking and runway calculations are really well done.', start_time: 130 },
      ],
    },
    {
      meetingUuid: 'avoma-m-004',
      meetingTitle: 'Product Feedback Session — RCT AI',
      attendees: [{ email: 'taylor@zeni.ai', name: 'Taylor Diamond' }, { email: 'jinghaoyang@rct.ai', name: 'Haoyang Jing' }],
      date: daysAgo(10),
      segments: [
        { speaker: 'Taylor Diamond', text: 'Haoyang, thanks for joining this feedback session. What\'s been your experience with Zeni so far?', start_time: 0 },
        { speaker: 'Haoyang Jing', text: 'We love it overall. The AP automation has saved us probably 8 hours a week. But we keep running into an issue where duplicate invoices get created when our vendors send reminders — Zeni doesn\'t seem to detect the duplicate.', start_time: 10 },
        { speaker: 'Taylor Diamond', text: 'That\'s a known issue we\'re working on. We\'re implementing vendor-side deduplication. Anything else?', start_time: 38 },
        { speaker: 'Haoyang Jing', text: 'The chart of accounts customization is pretty limited. We have a very specific internal taxonomy we use for reporting to our board and we can\'t fully replicate it in Zeni without a lot of workarounds.', start_time: 52 },
        { speaker: 'Haoyang Jing', text: 'Also on the positive side — your customer support team is outstanding. Every time we\'ve had an issue someone gets back to us within an hour and actually solves the problem. That\'s rare.', start_time: 88 },
        { speaker: 'Taylor Diamond', text: 'That\'s so great to hear. I\'ll make sure to pass that along to the support team.', start_time: 110 },
      ],
    },
    {
      meetingUuid: 'avoma-m-005',
      meetingTitle: 'Support Call — Magnalana',
      attendees: [{ email: 'malorie@zeni.ai', name: 'Malorie Pennie' }, { email: 'info@magnalana.com', name: 'Sandra Chen' }],
      date: daysAgo(12),
      segments: [
        { speaker: 'Malorie Pennie', text: 'Hi Sandra, I understand you\'ve been having trouble with the payroll integration. Can you walk me through what\'s happening?', start_time: 0 },
        { speaker: 'Sandra Chen', text: 'Sure. Every time we run payroll through Gusto, the journal entries in Zeni are wrong. The tax withholdings are showing up as expenses under the wrong category and it\'s messing up our P&L.', start_time: 15 },
        { speaker: 'Malorie Pennie', text: 'I see the issue — it looks like your Gusto sync mapping was set up before we updated our chart of accounts template. Let me fix that right now.', start_time: 45 },
        { speaker: 'Sandra Chen', text: 'Also, is there a way to get automated alerts when a reconciliation fails? Right now we only find out when we manually check, which is sometimes days later.', start_time: 80 },
        { speaker: 'Malorie Pennie', text: 'That\'s a great idea and actually something I\'ve heard from a few customers. I\'ll log that as a feature request. Let me confirm the Gusto mapping looks correct now on my end.', start_time: 100 },
        { speaker: 'Sandra Chen', text: 'Perfect. One more thing — we really love the spend analytics dashboard. Being able to see spending by vendor and category in one place is incredibly useful.', start_time: 125 },
      ],
    },
  ],
}

// ─── Front Raw ────────────────────────────────────────────────────────────────

const frontRaw = {
  fetchedAt: daysAgo(0),
  conversations: [
    { id: 'front-c-001', subject: 'Bank feed keeps disconnecting', status: 'resolved', created_at: Math.floor(new Date(daysAgo(3)).getTime() / 1000), updated_at: Math.floor(new Date(daysAgo(2)).getTime() / 1000), assignee: { email: 'support@zeni.ai', first_name: 'Support', last_name: 'Team' }, recipient: { handle: 'cto@verdanttech.io', name: 'David Park' }, tags: [{ name: 'bug' }, { name: 'bank-feed' }] },
    { id: 'front-c-002', subject: 'Can\'t export to QuickBooks format', status: 'open', created_at: Math.floor(new Date(daysAgo(4)).getTime() / 1000), updated_at: Math.floor(new Date(daysAgo(1)).getTime() / 1000), assignee: { email: 'yan@zeni.ai', first_name: 'Yan', last_name: 'Gao' }, recipient: { handle: 'finance@bridgewater-seed.com', name: 'Amy Torres' }, tags: [{ name: 'feature-request' }, { name: 'export' }] },
    { id: 'front-c-003', subject: 'Invoice categorization wrong for SaaS subscriptions', status: 'resolved', created_at: Math.floor(new Date(daysAgo(6)).getTime() / 1000), updated_at: Math.floor(new Date(daysAgo(5)).getTime() / 1000), assignee: { email: 'malorie@zeni.ai', first_name: 'Malorie', last_name: 'Pennie' }, recipient: { handle: 'ops@nova-labs.co', name: 'Kevin Walsh' }, tags: [{ name: 'bug' }, { name: 'categorization' }] },
    { id: 'front-c-004', subject: 'Would love a budget vs actuals report', status: 'open', created_at: Math.floor(new Date(daysAgo(9)).getTime() / 1000), updated_at: Math.floor(new Date(daysAgo(7)).getTime() / 1000), assignee: { email: 'taylor@zeni.ai', first_name: 'Taylor', last_name: 'Diamond' }, recipient: { handle: 'cfo@cloudnine-hq.com', name: 'Lisa Huang' }, tags: [{ name: 'feature-request' }] },
    { id: 'front-c-005', subject: 'R&D expense tagging for tax purposes', status: 'open', created_at: Math.floor(new Date(daysAgo(11)).getTime() / 1000), updated_at: Math.floor(new Date(daysAgo(9)).getTime() / 1000), assignee: { email: 'mike.ko@zeni.ai', first_name: 'Mike', last_name: 'Ko' }, recipient: { handle: 'admin@heliosworks.io', name: 'Priya Sharma' }, tags: [{ name: 'tax' }, { name: 'feature-request' }] },
  ],
  messages: [
    // front-c-001
    { id: 'front-msg-001a', conversationId: 'front-c-001', type: 'email', is_inbound: true, created_at: Math.floor(new Date(daysAgo(3)).getTime() / 1000), author: null, body: '', text: 'Hi, our Chase bank feed has disconnected three times in the last two weeks. Each time we reconnect it works for a day or two and then drops again. This is really disrupting our daily reconciliation.' },
    { id: 'front-msg-001b', conversationId: 'front-c-001', type: 'email', is_inbound: false, created_at: Math.floor(new Date(daysAgo(3)).getTime() / 1000) + 3600, author: { email: 'support@zeni.ai', first_name: 'Support', last_name: 'Team' }, body: '', text: 'Hi David, I\'m sorry for the disruption. We\'ve identified an issue with Chase\'s OAuth token refresh cycle that causes intermittent disconnects. Our engineering team has a fix in staging and it should be deployed by end of week. In the meantime, I\'ve applied a temporary workaround to your account that should keep it connected.' },
    { id: 'front-msg-001c', conversationId: 'front-c-001', type: 'email', is_inbound: true, created_at: Math.floor(new Date(daysAgo(2)).getTime() / 1000), author: null, body: '', text: 'The workaround seems to be holding, thanks! Looking forward to the permanent fix.' },
    // front-c-002
    { id: 'front-msg-002a', conversationId: 'front-c-002', type: 'email', is_inbound: true, created_at: Math.floor(new Date(daysAgo(4)).getTime() / 1000), author: null, body: '', text: 'We need to export our books to QuickBooks Desktop format (IIF file) for our external auditor. The current CSV export doesn\'t work — our auditor\'s import tool only accepts IIF or QBO format. Is this on your roadmap?' },
    { id: 'front-msg-002b', conversationId: 'front-c-002', type: 'email', is_inbound: false, created_at: Math.floor(new Date(daysAgo(4)).getTime() / 1000) + 7200, author: { email: 'yan@zeni.ai', first_name: 'Yan', last_name: 'Gao' }, body: '', text: 'Hi Amy, great question. We support QBO export today under Reports → Export → QuickBooks Online format. For QuickBooks Desktop IIF format, that\'s something we\'re evaluating for Q2. I\'ll add your vote to the feature request. In the meantime, the QBO format might work — worth trying with your auditor.' },
    { id: 'front-msg-002c', conversationId: 'front-c-002', type: 'email', is_inbound: true, created_at: Math.floor(new Date(daysAgo(1)).getTime() / 1000), author: null, body: '', text: 'The QBO format didn\'t work unfortunately — their tool only takes IIF. Please do prioritize this, it\'s blocking our audit process every quarter.' },
    // front-c-003
    { id: 'front-msg-003a', conversationId: 'front-c-003', type: 'email', is_inbound: true, created_at: Math.floor(new Date(daysAgo(6)).getTime() / 1000), author: null, body: '', text: 'Zeni keeps categorizing our AWS, Figma, and Notion subscriptions as "Office Supplies" instead of "Software & SaaS". We have to manually fix this every month. Can you fix the auto-categorization for SaaS tools?' },
    { id: 'front-msg-003b', conversationId: 'front-c-003', type: 'email', is_inbound: false, created_at: Math.floor(new Date(daysAgo(6)).getTime() / 1000) + 1800, author: { email: 'malorie@zeni.ai', first_name: 'Malorie', last_name: 'Pennie' }, body: '', text: 'Hi Kevin, I\'ve updated your merchant rules so AWS, Figma, and Notion will now auto-map to "Software & SaaS" going forward. We\'re also improving our ML model\'s recognition of common SaaS vendors in our next release — this should reduce the need for manual corrections significantly.' },
    // front-c-004
    { id: 'front-msg-004a', conversationId: 'front-c-004', type: 'email', is_inbound: true, created_at: Math.floor(new Date(daysAgo(9)).getTime() / 1000), author: null, body: '', text: 'One thing we really miss from our old system is a budget vs actuals report where we can set monthly targets by category and then see how we\'re tracking. Do you have anything like this? It\'s critical for our board reporting.' },
    { id: 'front-msg-004b', conversationId: 'front-c-004', type: 'email', is_inbound: false, created_at: Math.floor(new Date(daysAgo(8)).getTime() / 1000), author: { email: 'taylor@zeni.ai', first_name: 'Taylor', last_name: 'Diamond' }, body: '', text: 'Hi Lisa, we don\'t have budget vs actuals today but I want to be honest — it\'s the most requested reporting feature we have. It\'s on our H1 roadmap. I\'ll make sure you\'re in the beta when it\'s ready.' },
    // front-c-005
    { id: 'front-msg-005a', conversationId: 'front-c-005', type: 'email', is_inbound: true, created_at: Math.floor(new Date(daysAgo(11)).getTime() / 1000), author: null, body: '', text: 'We\'re a software company and need to tag certain engineering expenses as R&D for the R&D tax credit. Is there a way to flag transactions or categories specifically for R&D tracking so we can pull a report at tax time?' },
    { id: 'front-msg-005b', conversationId: 'front-c-005', type: 'email', is_inbound: false, created_at: Math.floor(new Date(daysAgo(10)).getTime() / 1000), author: { email: 'mike.ko@zeni.ai', first_name: 'Mike', last_name: 'Ko' }, body: '', text: 'Hi Priya, this is a great use case and one we hear from a lot of our software-company customers. You can create a custom tag "R&D" today and apply it to transactions, then filter by that tag in reports. It\'s a bit manual but works. A dedicated R&D expense tracking module with automatic categorization suggestions is on our tax roadmap for later this year.' },
    { id: 'front-msg-005c', conversationId: 'front-c-005', type: 'email', is_inbound: true, created_at: Math.floor(new Date(daysAgo(9)).getTime() / 1000), author: null, body: '', text: 'The custom tag approach works for now, thank you! Excited to hear about the dedicated R&D module — that would save us hours at tax time.' },
  ],
}

// ─── Slack Raw ────────────────────────────────────────────────────────────────

const slackRaw = {
  fetchedAt: daysAgo(0),
  channels: [
    { id: 'C03V288NLMD', name: 'cs-feedback' },
    { id: 'C05JVBGRYCQ', name: 'product-requests' },
    { id: 'C08HTC413CM', name: 'customer-escalations' },
  ],
  messages: [
    // cs-feedback
    { ts: String(Math.floor(new Date(daysAgo(1)).getTime() / 1000) + 0.001), user: 'U001', username: 'Taylor Diamond', text: 'Just off a call with Acme Corp. Rachel loved the transaction categorization but is really frustrated with the bank sync dropping. She said it\'s disrupting their daily close. Logging as high priority bug.', channel: 'C03V288NLMD', channelName: 'cs-feedback' },
    { ts: String(Math.floor(new Date(daysAgo(1)).getTime() / 1000) + 120.001), user: 'U002', username: 'Malorie Pennie', text: 'Yeah I\'ve had 3 customers mention the bank sync this week alone. @mike.ko can we get an ETA from eng?', channel: 'C03V288NLMD', channelName: 'cs-feedback' },
    { ts: String(Math.floor(new Date(daysAgo(1)).getTime() / 1000) + 240.001), user: 'U003', username: 'Mike Ko', text: 'Engineering says fix is in review, should deploy by Friday. I\'ll update all affected accounts.', channel: 'C03V288NLMD', channelName: 'cs-feedback' },
    { ts: String(Math.floor(new Date(daysAgo(2)).getTime() / 1000) + 0.001), user: 'U004', username: 'Yan Gao', text: 'Bridgewater Seed came back and said QBO export format doesn\'t work for their auditor — they need IIF specifically. This is now the 4th customer who needs QuickBooks Desktop export. Should we bump it up the roadmap?', channel: 'C03V288NLMD', channelName: 'cs-feedback' },
    { ts: String(Math.floor(new Date(daysAgo(2)).getTime() / 1000) + 300.001), user: 'U001', username: 'Taylor Diamond', text: 'Agreed. I\'ll bring it up at the next product sync. The audit use case is real and recurring.', channel: 'C03V288NLMD', channelName: 'cs-feedback' },
    // product-requests
    { ts: String(Math.floor(new Date(daysAgo(3)).getTime() / 1000) + 0.001), user: 'U002', username: 'Malorie Pennie', text: 'Feature request from Magnalana: automated alerts when a reconciliation fails. Right now customers only find out when they manually check — sometimes days later. Simple email/Slack notification would prevent a lot of headaches.', channel: 'C05JVBGRYCQ', channelName: 'product-requests' },
    { ts: String(Math.floor(new Date(daysAgo(3)).getTime() / 1000) + 180.001), user: 'U003', username: 'Mike Ko', text: 'This comes up constantly. Also related — customers want alerts for large or unusual transactions. Could be a general "smart alerts" feature.', channel: 'C05JVBGRYCQ', channelName: 'product-requests' },
    { ts: String(Math.floor(new Date(daysAgo(4)).getTime() / 1000) + 0.001), user: 'U004', username: 'Yan Gao', text: 'Sequoia portfolio co renewal call today. Maria is committed to renewing but made two explicit asks: (1) multi-entity support — managing 3 LLCs in separate accounts is painful for her, (2) TurboTax Business export fix. Both are blockers for expanding within their portfolio.', channel: 'C05JVBGRYCQ', channelName: 'product-requests' },
    { ts: String(Math.floor(new Date(daysAgo(4)).getTime() / 1000) + 600.001), user: 'U001', username: 'Taylor Diamond', text: 'Multi-entity is literally our #1 most requested feature right now. I\'ve logged it from 12 different accounts this quarter. We need to accelerate this.', channel: 'C05JVBGRYCQ', channelName: 'product-requests' },
    { ts: String(Math.floor(new Date(daysAgo(5)).getTime() / 1000) + 0.001), user: 'U002', username: 'Malorie Pennie', text: 'Cloud Nine HQ CFO emailed asking about budget vs actuals reporting. Told her it\'s on roadmap but she pushed back — said they\'ll evaluate alternatives if it\'s not ready by Q3. Flagging as churn risk.', channel: 'C05JVBGRYCQ', channelName: 'product-requests' },
    // customer-escalations
    { ts: String(Math.floor(new Date(daysAgo(1)).getTime() / 1000) + 0.001), user: 'U003', username: 'Mike Ko', text: 'ESCALATION: Palo Alto Ventures — mobile app crashing on iOS 17 when approving expenses. This is completely blocking their expense approval workflow. James Nguyen is a key decision maker for the renewal. Need eng to look at this ASAP.', channel: 'C08HTC413CM', channelName: 'customer-escalations' },
    { ts: String(Math.floor(new Date(daysAgo(1)).getTime() / 1000) + 900.001), user: 'U001', username: 'Taylor Diamond', text: 'I can reproduce on my iPhone 15 with iOS 17.4. Crash happens on the ExpenseApprovalView. Filing bug report now.', channel: 'C08HTC413CM', channelName: 'customer-escalations' },
    { ts: String(Math.floor(new Date(daysAgo(1)).getTime() / 1000) + 1800.001), user: 'U004', username: 'Yan Gao', text: 'Also flagging: month-end close report very slow for large accounts (30-40 second load times per Palo Alto Ventures). This is a separate issue from the crash but also causing frustration. Tagging as performance bug.', channel: 'C08HTC413CM', channelName: 'customer-escalations' },
    { ts: String(Math.floor(new Date(daysAgo(2)).getTime() / 1000) + 0.001), user: 'U002', username: 'Malorie Pennie', text: 'Update on Magnalana Gusto sync issue — root cause was misconfigured payroll journal entry mapping from our October schema update. Fixed on their account. Logging as a bug that could affect other Gusto customers who onboarded before October.', channel: 'C08HTC413CM', channelName: 'customer-escalations' },
  ],
}

// ─── Feedback Items ───────────────────────────────────────────────────────────

const feedbackItems = [
  // ── HIGH urgency issues ──
  { id: 'fb-001', source: 'avoma', type: 'issue', title: 'Bank feed disconnecting repeatedly for Chase accounts', description: 'Multiple customers report their Chase bank feed disconnects every 1-2 days, requiring manual re-authentication. This disrupts daily reconciliation workflows. Affects Acme Corp (Rachel Kim) and at least 2 other accounts. Root cause appears to be OAuth token refresh cycle issue with Chase.', urgency: 'high', customer: 'Acme Corp', rep: 'Taylor Diamond', date: dateOnly(2), tags: ['Checking / Debit'], rawSourceId: 'avoma-m-001', analyzedAt: daysAgo(1) },
  { id: 'fb-002', source: 'avoma', type: 'issue', title: 'Mobile app crashes on iOS 17 when approving expenses', description: 'iOS 17 users experience an immediate crash when tapping the approve button on the expense approval screen. Confirmed reproducible on iPhone 15 with iOS 17.4. Completely blocking expense approval workflow for Palo Alto Ventures. Customer is a renewal risk.', urgency: 'high', customer: 'Palo Alto Ventures', rep: 'Mike Ko', date: dateOnly(5), tags: ['Reimbursements'], rawSourceId: 'avoma-m-002', analyzedAt: daysAgo(1) },
  { id: 'fb-003', source: 'slack', type: 'issue', title: 'iOS 17 expense approval crash confirmed reproducible', description: 'Escalated via customer-escalations channel. Crash reproduced on iPhone 15 iOS 17.4 on ExpenseApprovalView. Engineering bug filed. Palo Alto Ventures identified as renewal risk if not resolved quickly.', urgency: 'high', customer: 'Palo Alto Ventures', rep: 'Taylor Diamond', date: dateOnly(1), tags: ['Reimbursements'], rawSourceId: 'slack-C08HTC413CM-' + (Math.floor(new Date(daysAgo(1)).getTime() / 1000)), analyzedAt: daysAgo(0) },
  { id: 'fb-004', source: 'front', type: 'issue', title: 'Bank sync disconnecting — Chase OAuth token refresh issue', description: 'Verdant Tech customer David Park reports Chase bank feed disconnecting 3 times in two weeks. Support identified a Chase OAuth token refresh cycle bug. Engineering fix in staging, temporary workaround applied.', urgency: 'high', customer: 'Verdant Tech', rep: 'Support Team', date: dateOnly(3), tags: ['Checking / Debit'], rawSourceId: 'front-c-001', analyzedAt: daysAgo(0) },
  // ── MEDIUM urgency issues ──
  { id: 'fb-005', source: 'avoma', type: 'issue', title: 'Month-end close report extremely slow for large accounts', description: 'Palo Alto Ventures reports month-end close report takes 30-40 seconds to load when transaction volume is high. Customers fear the page has crashed. Performance issue flagged as separate from mobile crash bug.', urgency: 'medium', customer: 'Palo Alto Ventures', rep: 'Mike Ko', date: dateOnly(5), tags: ['Reports'], rawSourceId: 'avoma-m-002', analyzedAt: daysAgo(1) },
  { id: 'fb-006', source: 'avoma', type: 'issue', title: 'Duplicate invoices created when vendors send payment reminders', description: 'RCT AI reports duplicate invoice entries appearing in Zeni when vendors send follow-up reminder emails. The system doesn\'t detect that the reminder references an existing invoice. Engineering working on vendor-side deduplication.', urgency: 'medium', customer: 'RCT AI', rep: 'Taylor Diamond', date: dateOnly(10), tags: ['Bill Pay'], rawSourceId: 'avoma-m-004', analyzedAt: daysAgo(1) },
  { id: 'fb-007', source: 'avoma', type: 'issue', title: 'Gusto payroll journal entries categorized incorrectly', description: 'Magnalana\'s Gusto sync was creating wrong journal entries — tax withholdings mapped to wrong expense category, distorting P&L. Root cause: Gusto sync mapping configured before October chart of accounts update. Fixed manually; may affect other pre-October Gusto customers.', urgency: 'medium', customer: 'Magnalana', rep: 'Malorie Pennie', date: dateOnly(12), tags: ['Integrations'], rawSourceId: 'avoma-m-005', analyzedAt: daysAgo(1) },
  { id: 'fb-008', source: 'front', type: 'issue', title: 'SaaS subscriptions auto-categorized as Office Supplies', description: 'Nova Labs reports AWS, Figma, and Notion subscriptions being categorized as "Office Supplies" instead of "Software & SaaS". Requires manual correction each month. Merchant rules updated as workaround; ML model improvements in next release.', urgency: 'medium', customer: 'Nova Labs', rep: 'Malorie Pennie', date: dateOnly(6), tags: ['Dashboard'], rawSourceId: 'front-c-003', analyzedAt: daysAgo(0) },
  { id: 'fb-009', source: 'avoma', type: 'issue', title: 'TurboTax Business export generates wrong file format', description: 'Sequoia portfolio company\'s CPA cannot use TurboTax Business export — the format is incompatible and requires manual reformatting. Customer explicitly tied this to renewal decision.', urgency: 'medium', customer: 'Sequoia Portfolio Co', rep: 'Yan Gao', date: dateOnly(8), tags: ['Integrations', 'Reports'], rawSourceId: 'avoma-m-003', analyzedAt: daysAgo(1) },
  { id: 'fb-010', source: 'front', type: 'issue', title: 'QuickBooks Desktop IIF export format not supported', description: 'Bridgewater Seed\'s auditor requires IIF file format for QuickBooks Desktop import. Current QBO format export is incompatible. This is the 4th account requesting IIF export, blocking audit workflows quarterly.', urgency: 'medium', customer: 'Bridgewater Seed', rep: 'Yan Gao', date: dateOnly(4), tags: ['Integrations'], rawSourceId: 'front-c-002', analyzedAt: daysAgo(0) },
  // ── FEATURE REQUESTS ──
  { id: 'fb-011', source: 'avoma', type: 'feature_request', title: 'Bulk transaction category editing', description: 'Acme Corp CFO requests ability to select multiple transactions and apply a category in bulk. Currently requires clicking into each transaction individually. Taylor confirmed this is on near-term roadmap.', urgency: 'high', customer: 'Acme Corp', rep: 'Taylor Diamond', date: dateOnly(2), tags: ['Dashboard'], rawSourceId: 'avoma-m-001', analyzedAt: daysAgo(1) },
  { id: 'fb-012', source: 'avoma', type: 'feature_request', title: 'Read-only accountant/CPA access role', description: 'Acme Corp needs a guest or accountant role that gives external CPAs read-only access to pull reports at month end without exposing full account access. Currently no sufficient permission tier exists.', urgency: 'medium', customer: 'Acme Corp', rep: 'Taylor Diamond', date: dateOnly(2), tags: ['Reports', 'Dashboard'], rawSourceId: 'avoma-m-001', analyzedAt: daysAgo(1) },
  { id: 'fb-013', source: 'avoma', type: 'feature_request', title: 'Multi-entity support — manage multiple LLCs in one account', description: 'Sequoia portfolio company manages 3 separate LLCs and must log into 3 separate Zeni accounts. Requesting consolidated multi-entity view. This is explicitly tied to renewal and portfolio expansion. Described by Taylor as the #1 most requested feature this quarter (12+ accounts).', urgency: 'high', customer: 'Sequoia Portfolio Co', rep: 'Yan Gao', date: dateOnly(8), tags: ['Dashboard'], rawSourceId: 'avoma-m-003', analyzedAt: daysAgo(1) },
  { id: 'fb-014', source: 'avoma', type: 'feature_request', title: 'Chart of accounts deeper customization', description: 'RCT AI needs more flexible chart of accounts customization to replicate their internal taxonomy for board reporting. Current system has significant limitations for non-standard account structures.', urgency: 'medium', customer: 'RCT AI', rep: 'Taylor Diamond', date: dateOnly(10), tags: ['Dashboard', 'Reports'], rawSourceId: 'avoma-m-004', analyzedAt: daysAgo(1) },
  { id: 'fb-015', source: 'avoma', type: 'feature_request', title: 'Automated alerts when reconciliation fails', description: 'Magnalana and multiple other customers want email/Slack notifications when a bank reconciliation fails. Currently requires manual check — issues go unnoticed for days. Malorie flagged this as a "smart alerts" opportunity that could cover reconciliation failures and unusual transactions.', urgency: 'medium', customer: 'Magnalana', rep: 'Malorie Pennie', date: dateOnly(12), tags: ['Dashboard', 'Checking / Debit'], rawSourceId: 'avoma-m-005', analyzedAt: daysAgo(1) },
  { id: 'fb-016', source: 'front', type: 'feature_request', title: 'Budget vs actuals reporting by category', description: 'Cloud Nine HQ CFO Lisa Huang requests the ability to set monthly budget targets by expense category and track actuals against them — critical for board reporting. Currently missing from Zeni. Taylor confirmed it\'s the most requested reporting feature, on H1 roadmap. Customer flagged as churn risk if not available by Q3.', urgency: 'high', customer: 'Cloud Nine HQ', rep: 'Taylor Diamond', date: dateOnly(9), tags: ['Reports'], rawSourceId: 'front-c-004', analyzedAt: daysAgo(0) },
  { id: 'fb-017', source: 'front', type: 'feature_request', title: 'R&D expense tagging for tax credit tracking', description: 'Helios Works needs to flag engineering transactions as R&D for the R&D tax credit calculation. Workaround with custom tags provided, but customer wants a dedicated R&D expense tracking module with automatic categorization suggestions.', urgency: 'low', customer: 'Helios Works', rep: 'Mike Ko', date: dateOnly(11), tags: ['Dashboard', 'Reports'], rawSourceId: 'front-c-005', analyzedAt: daysAgo(0) },
  { id: 'fb-018', source: 'slack', type: 'feature_request', title: 'Multi-entity support urgently needed — 12+ accounts requesting', description: 'Internal product-requests channel: Taylor reports 12 separate accounts this quarter have requested multi-entity support. Yan flagged Sequoia portfolio co renewal tied to it. Team consensus: needs to be accelerated on roadmap.', urgency: 'high', customer: 'Multiple', rep: 'Taylor Diamond', date: dateOnly(4), tags: ['Dashboard'], rawSourceId: 'slack-C05JVBGRYCQ-' + (Math.floor(new Date(daysAgo(4)).getTime() / 1000)), analyzedAt: daysAgo(0) },
  { id: 'fb-019', source: 'slack', type: 'feature_request', title: 'QuickBooks Desktop IIF export — 4th customer requesting', description: 'Yan flagged in cs-feedback: fourth customer requesting IIF export for QuickBooks Desktop for audit purposes. Taylor agreed to bring to next product sync. Recurring blocker for audit workflows.', urgency: 'medium', customer: 'Multiple', rep: 'Yan Gao', date: dateOnly(2), tags: ['Integrations'], rawSourceId: 'slack-C03V288NLMD-' + (Math.floor(new Date(daysAgo(2)).getTime() / 1000)), analyzedAt: daysAgo(0) },
  // ── PRAISES ──
  { id: 'fb-020', source: 'avoma', type: 'praise', title: 'Transaction categorization AI saves significant manual work', description: 'Acme Corp CFO Rachel Kim reports 90% correct auto-categorization on first pass, saving substantial manual effort. "The categorization AI is honestly impressive."', urgency: 'low', customer: 'Acme Corp', rep: 'Taylor Diamond', date: dateOnly(2), tags: ['AI CFO', 'Dashboard'], rawSourceId: 'avoma-m-001', analyzedAt: daysAgo(1) },
  { id: 'fb-021', source: 'avoma', type: 'praise', title: 'Bookkeeping automation reduced monthly effort from 15 hours to 3', description: 'Palo Alto Ventures (James Nguyen) reports their back office bookkeeping time dropped from ~15 hours/month to ~3 hours. "Honestly it\'s been transformative for our back office." Customer also referred two other portfolio companies.', urgency: 'low', customer: 'Palo Alto Ventures', rep: 'Mike Ko', date: dateOnly(5), tags: ['AI CFO', 'Dashboard'], rawSourceId: 'avoma-m-002', analyzedAt: daysAgo(1) },
  { id: 'fb-022', source: 'avoma', type: 'praise', title: 'Burn rate tracking and runway calculations highly valued', description: 'Sequoia portfolio company\'s Maria Lopez specifically called out burn rate tracking and runway calculations as "really well done" features, citing them as core value drivers for their renewal.', urgency: 'low', customer: 'Sequoia Portfolio Co', rep: 'Yan Gao', date: dateOnly(8), tags: ['AI CFO', 'Treasury'], rawSourceId: 'avoma-m-003', analyzedAt: daysAgo(1) },
  { id: 'fb-023', source: 'avoma', type: 'praise', title: 'AP automation saves ~8 hours per week', description: 'RCT AI\'s Haoyang Jing reports AP automation saves approximately 8 hours per week. The team is very happy with the automation despite some feature gaps.', urgency: 'low', customer: 'RCT AI', rep: 'Taylor Diamond', date: dateOnly(10), tags: ['AI CFO', 'Bill Pay'], rawSourceId: 'avoma-m-004', analyzedAt: daysAgo(1) },
  { id: 'fb-024', source: 'avoma', type: 'praise', title: 'Customer support response time and quality praised', description: 'RCT AI\'s Haoyang Jing specifically praised Zeni\'s support team: "Every time we\'ve had an issue someone gets back to us within an hour and actually solves the problem. That\'s rare." Outstanding support is a key differentiator.', urgency: 'low', customer: 'RCT AI', rep: 'Taylor Diamond', date: dateOnly(10), tags: ['Dashboard'], rawSourceId: 'avoma-m-004', analyzedAt: daysAgo(1) },
  { id: 'fb-025', source: 'avoma', type: 'praise', title: 'Spend analytics dashboard called out as incredibly useful', description: 'Magnalana\'s Sandra Chen praised the spend analytics dashboard: "Being able to see spending by vendor and category in one place is incredibly useful."', urgency: 'low', customer: 'Magnalana', rep: 'Malorie Pennie', date: dateOnly(12), tags: ['AI CFO', 'Reports'], rawSourceId: 'avoma-m-005', analyzedAt: daysAgo(1) },
  { id: 'fb-026', source: 'front', type: 'praise', title: 'R&D tag workaround appreciated — customer excited for full module', description: 'Helios Works expressed appreciation for the custom tag workaround and enthusiasm for the upcoming dedicated R&D module: "that would save us hours at tax time."', urgency: 'low', customer: 'Helios Works', rep: 'Mike Ko', date: dateOnly(9), tags: ['Dashboard', 'Reports'], rawSourceId: 'front-c-005', analyzedAt: daysAgo(0) },

  // ── SERVICE FEEDBACK ──
  { id: 'svc-001', appType: 'service', source: 'front', type: 'issue', title: 'Onboarding delayed 3 weeks — no dedicated implementation contact', description: 'Ironwood Growth (Priya Kapoor) reports their onboarding has stalled for 3 weeks with no clear point of contact. Kick-off was scheduled twice and rescheduled by Zeni each time. Customer is frustrated and questioning their purchase decision before even going live.', urgency: 'high', customer: 'Ironwood Growth', rep: 'Jordan Ellis', date: dateOnly(3), tags: ['Dashboard'], rawSourceId: 'front-svc-001', analyzedAt: daysAgo(0) },
  { id: 'svc-002', appType: 'service', source: 'slack', type: 'issue', title: 'Payroll integration setup stalled — no CS follow-through', description: 'Escalated in cs-escalations: Ironwood Growth\'s Gusto payroll integration hasn\'t been configured 2 weeks after go-live. CS ticket was marked resolved but customer says nothing changed. Jordan Ellis needs to personally re-engage.', urgency: 'high', customer: 'Ironwood Growth', rep: 'Jordan Ellis', date: dateOnly(2), tags: ['Integrations'], rawSourceId: 'slack-C08HTC413CM-' + (Math.floor(new Date(daysAgo(2)).getTime() / 1000) + 10), analyzedAt: daysAgo(0) },
  { id: 'svc-003', appType: 'service', source: 'front', type: 'issue', title: 'Customer unclear on who their account manager is', description: 'Summit Ridge Partners (Omar Reyes) emailed support asking who their account manager is — they\'ve received responses from 4 different people over the last month and don\'t know who to call. No ownership assigned in internal CRM.', urgency: 'medium', customer: 'Summit Ridge Partners', rep: 'Mike Ko', date: dateOnly(7), tags: ['Dashboard'], rawSourceId: 'front-svc-002', analyzedAt: daysAgo(0) },
  { id: 'svc-004', appType: 'service', source: 'front', type: 'issue', title: 'Support ticket open 11 days with no resolution', description: 'Verdant Tech (Aisha Ndume) reports a bill pay support ticket has been open for 11 days. Multiple follow-ups sent with no substantive response. Customer\'s CFO is now involved and threatening to escalate to their board.', urgency: 'high', customer: 'Verdant Tech', rep: 'Support Team', date: dateOnly(1), tags: ['Bill Pay'], rawSourceId: 'front-svc-003', analyzedAt: daysAgo(0) },
  { id: 'svc-005', appType: 'service', source: 'avoma', type: 'issue', title: 'Month-end close deliverables consistently arriving late', description: 'Nova Labs (Ben Torres) raised in QBR that their monthly bookkeeping deliverables have been late 3 months in a row — typically 2-4 days past the promised date. This delays their board reporting. Service SLA needs to be enforced.', urgency: 'medium', customer: 'Nova Labs', rep: 'Malorie Pennie', date: dateOnly(6), tags: ['Reports'], rawSourceId: 'avoma-m-002', analyzedAt: daysAgo(1) },
  { id: 'svc-006', appType: 'service', source: 'front', type: 'feature_request', title: 'Dedicated Slack channel for CS communication requested', description: 'Pillow Cube (Cole Schutjer brands) requests a dedicated shared Slack channel for day-to-day communication with their CS team, similar to what their previous bookkeeping firm offered. Email response times feel too slow for urgent issues.', urgency: 'medium', customer: 'Pillow Cube / Cold Case Ice Cream (Cole Schutjer brands)', rep: 'Lauren Hammond', date: dateOnly(5), tags: ['Dashboard'], rawSourceId: 'front-svc-004', analyzedAt: daysAgo(0) },
  { id: 'svc-007', appType: 'service', source: 'avoma', type: 'praise', title: 'Proactive catch of duplicate vendor payment praised', description: 'Magnalana (Sandra Chen) specifically praised their CS rep for proactively flagging a $12,400 duplicate vendor payment before it processed. "That kind of attention is exactly why we trust Zeni."', urgency: 'low', customer: 'Magnalana', rep: 'Malorie Pennie', date: dateOnly(4), tags: ['Bill Pay'], rawSourceId: 'avoma-m-005', analyzedAt: daysAgo(1) },
  { id: 'svc-008', appType: 'service', source: 'slack', type: 'issue', title: 'New hire onboarding to Zeni taking too long — no self-serve docs', description: 'Internal cs-feedback thread: Multiple reps note that when a customer\'s finance hire changes, re-onboarding them to Zeni takes 3-5 hours of CS time due to lack of self-serve documentation and training resources. Customers are frustrated by the dependency.', urgency: 'medium', customer: 'Multiple', rep: 'Taylor Diamond', date: dateOnly(8), tags: ['Dashboard'], rawSourceId: 'slack-C05JVBGRYCQ-' + (Math.floor(new Date(daysAgo(8)).getTime() / 1000) + 5), analyzedAt: daysAgo(0) },

  // ── CHURN RISK ──
  { id: 'chr-001', appType: 'churn_risk', source: 'avoma', type: 'issue', title: 'Customer evaluating Ramp as replacement — missing expense policy enforcement', description: 'Ironwood Growth (Priya Kapoor) disclosed they are actively evaluating Ramp due to lack of expense policy enforcement in Zeni. Their CFO wants automated policy violations flagged and blocked at point of spend. Renewal is in 60 days. Jordan Ellis flagged as P1 churn risk.', urgency: 'high', customer: 'Ironwood Growth', rep: 'Jordan Ellis', date: dateOnly(4), tags: ['Reimbursements', 'AI CFO'], rawSourceId: 'avoma-m-003', analyzedAt: daysAgo(1) },
  { id: 'chr-002', appType: 'churn_risk', source: 'front', type: 'issue', title: 'Budget vs actuals gap causing CFO to question ROI', description: 'Cloud Nine HQ (Lisa Huang) states that without budget vs actuals reporting, their CFO cannot use Zeni for board packages and is still using Excel. "We\'re paying for a tool that only does half the job." Renewal in 45 days — explicitly tied to this feature shipping.', urgency: 'high', customer: 'Cloud Nine HQ', rep: 'Taylor Diamond', date: dateOnly(2), tags: ['Reports'], rawSourceId: 'front-c-004', analyzedAt: daysAgo(0) },
  { id: 'chr-003', appType: 'churn_risk', source: 'avoma', type: 'issue', title: 'Multi-entity requirement — renewal explicitly conditional', description: 'Sequoia Portfolio Co (Maria Lopez) confirmed renewal is conditional on multi-entity support being available. They manage 3 LLCs and are currently paying for 3 separate Zeni accounts. Competitor (Pilot) quoted them a single multi-entity plan at similar price. 90-day window.', urgency: 'high', customer: 'Sequoia Portfolio Co', rep: 'Yan Gao', date: dateOnly(9), tags: ['Dashboard'], rawSourceId: 'avoma-m-003', analyzedAt: daysAgo(1) },
  { id: 'chr-004', appType: 'churn_risk', source: 'front', type: 'issue', title: 'Executive sponsor (CFO) departing — new CFO evaluating all vendors', description: 'Bridgewater Seed\'s CFO is leaving next month. New CFO is an ex-NetSuite user and doing a full vendor review. No relationship with Zeni. Yan Gao scheduled intro call but new CFO has not responded. At risk of losing account without executive champion.', urgency: 'high', customer: 'Bridgewater Seed', rep: 'Yan Gao', date: dateOnly(3), tags: ['Dashboard'], rawSourceId: 'front-svc-003', analyzedAt: daysAgo(0) },
  { id: 'chr-005', appType: 'churn_risk', source: 'slack', type: 'issue', title: 'Low product adoption — fewer than 3 users active', description: 'Internal cs-health channel: Payscore has fewer than 3 active Zeni users 4 months after onboarding. Primary contact (Alexander Cugini) hasn\'t logged in for 6 weeks. CS flagged as red account. Risk of non-renewal due to low stickiness and no demonstrated ROI.', urgency: 'medium', customer: 'Payscore', rep: 'Alexander Cugini', date: dateOnly(6), tags: ['Dashboard', 'Reports'], rawSourceId: 'slack-C05JVBGRYCQ-' + (Math.floor(new Date(daysAgo(6)).getTime() / 1000) + 3), analyzedAt: daysAgo(0) },
  { id: 'chr-006', appType: 'churn_risk', source: 'avoma', type: 'issue', title: 'Price increase at renewal causing pushback — competitor quote obtained', description: 'RCT AI received their renewal quote with a 22% price increase. Haoyang Jing shared they\'ve received a competitive quote from Pilot at 15% less. Despite liking Zeni, the price delta is hard to justify to their board. Taylor needs exec sponsor to intervene.', urgency: 'high', customer: 'RCT AI', rep: 'Taylor Diamond', date: dateOnly(7), tags: ['AI CFO'], rawSourceId: 'avoma-m-004', analyzedAt: daysAgo(1) },
  { id: 'chr-007', appType: 'churn_risk', source: 'front', type: 'issue', title: 'TurboTax export blocker — CPA threatening to switch firms', description: 'Sequoia Portfolio Co\'s CPA sent a formal letter stating they cannot support the client if IIF/TurboTax Business export issues are unresolved before April 15 tax deadline. Customer is caught in the middle and may cancel to maintain CPA relationship.', urgency: 'high', customer: 'Sequoia Portfolio Co', rep: 'Yan Gao', date: dateOnly(5), tags: ['Integrations', 'Reports'], rawSourceId: 'front-c-002', analyzedAt: daysAgo(0) },
  { id: 'chr-008', appType: 'churn_risk', source: 'slack', type: 'issue', title: 'Customer has not completed onboarding after 45 days — cancellation risk', description: 'cs-health alert: Ironwood Growth is 45 days post-contract-start with less than 20% onboarding completion. At this rate, they will not be live before their first invoicing cycle. CS team estimates 70% cancellation probability if not resolved in next 2 weeks.', urgency: 'high', customer: 'Ironwood Growth', rep: 'Jordan Ellis', date: dateOnly(1), tags: ['Dashboard'], rawSourceId: 'slack-C08HTC413CM-' + (Math.floor(new Date(daysAgo(1)).getTime() / 1000) + 20), analyzedAt: daysAgo(0) },
]

// ─── Write everything ─────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding dummy data...\n')

  // Preserve existing API keys
  const config = await readConfig()

  await write('avoma-raw.json', avomaRaw)
  await write('front-raw.json', frontRaw)
  await write('slack-raw.json', slackRaw)
  await write('feedback.json', {
    lastAnalyzedAt: daysAgo(0),
    items: feedbackItems,
  })

  // Reset sync timestamps so incremental sync doesn't skip data
  if (config.avoma) {
    delete config.avoma.lastSyncedAt
  }
  if (config.front) {
    delete config.front.lastSyncedAt
  }
  if (config.slack) {
    delete config.slack.lastSyncedAt
  }
  await write('config.json', config)

  console.log(`\nDone. Seeded:`)
  console.log(`  ${avomaRaw.transcripts.length} Avoma transcripts`)
  console.log(`  ${frontRaw.conversations.length} Front conversations`)
  console.log(`  ${slackRaw.messages.length} Slack messages`)
  console.log(`  ${feedbackItems.length} analyzed feedback items`)
  console.log(`\nOpen http://localhost:5001 to see the data.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
