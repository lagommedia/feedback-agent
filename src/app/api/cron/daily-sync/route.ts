/**
 * Daily automated sync + analysis pipeline.
 *
 * Called by Vercel Cron at 9 AM UTC (5 AM ET, 2 AM PT) each day.
 * Syncs yesterday's Avoma meetings and Front conversations, then runs
 * one analysis pass — enough to process a typical day's worth of content.
 *
 * Auth: Vercel automatically sends `Authorization: Bearer {CRON_SECRET}`
 * when invoking cron routes. Set CRON_SECRET in your Vercel env vars.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import {
  readConfig,
  writeConfig,
  mergeAvomaRaw,
  mergeFrontRaw,
  unmarkAnalyzedSources,
  getStoredTranscriptUuids,
  getUnanalyzedAvomaTranscripts,
  getUnanalyzedFrontConversations,
  appendFeedbackItems,
  writeFeedbackStore,
  markSourcesAnalyzed,
  getTrainingExamples,
  getUnanalyzedCounts,
  readSlackRaw,
} from '@/lib/storage'
import { syncAvoma } from '@/lib/avoma'
import { syncFront } from '@/lib/front'
import { analyzeAllContent } from '@/lib/anthropic'
import type { FeedbackItem } from '@/types'

export async function GET(req: Request) {
  // Verify this is a legitimate Vercel cron invocation
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startedAt = Date.now()
  const log: string[] = []

  try {
    const config = await readConfig()

    // ── 1. Avoma sync ─────────────────────────────────────────────────────────
    if (config.avoma?.apiKey) {
      try {
        const maxLookback = new Date()
        maxLookback.setDate(maxLookback.getDate() - 1)
        maxLookback.setHours(0, 0, 0, 0)

        const since = config.avoma.lastSyncedAt
          ? new Date(Math.max(new Date(config.avoma.lastSyncedAt).getTime(), maxLookback.getTime()))
          : maxLookback

        const knownUuids = await getStoredTranscriptUuids()
        const avomaData = await syncAvoma(config.avoma.apiKey, since, knownUuids)
        await mergeAvomaRaw(avomaData)

        await writeConfig({
          ...config,
          avoma: { ...config.avoma, lastSyncedAt: new Date().toISOString() },
        })
        log.push(`avoma: synced ${avomaData.transcripts.length} new transcripts`)
      } catch (err) {
        log.push(`avoma: sync failed — ${String(err)}`)
        console.error('[daily-sync] Avoma sync error:', err)
      }
    } else {
      log.push('avoma: not configured, skipped')
    }

    // ── 2. Front sync ─────────────────────────────────────────────────────────
    const freshConfig = await readConfig() // re-read after Avoma wrote lastSyncedAt
    if (freshConfig.front?.bearerToken) {
      try {
        const frontConfig = freshConfig.front

        const ongoingCap = new Date()
        ongoingCap.setHours(ongoingCap.getHours() - 24)

        const since = frontConfig.lastSyncedAt
          ? new Date(Math.max(new Date(frontConfig.lastSyncedAt).getTime(), ongoingCap.getTime()))
          : ongoingCap

        const frontData = await syncFront(
          frontConfig.bearerToken!,
          since,
          frontConfig.internalEmails ?? [],
          frontConfig.inboxIds ?? [],
          40,      // perCallLimit
          200_000  // budgetMs
        )
        await mergeFrontRaw(frontData)

        // Re-queue re-synced conversations so fresh replies get re-analyzed
        const syncedIds = frontData.conversations.map((c) => c.id)
        const cleared = await unmarkAnalyzedSources(syncedIds)

        await writeConfig({
          ...freshConfig,
          front: { ...frontConfig, lastSyncedAt: new Date().toISOString() },
        })
        log.push(
          `front: synced ${frontData.conversations.length} conversations (${cleared} re-queued for analysis)`
        )
      } catch (err) {
        log.push(`front: sync failed — ${String(err)}`)
        console.error('[daily-sync] Front sync error:', err)
      }
    } else {
      log.push('front: not configured, skipped')
    }

    // ── 3. Analyze ────────────────────────────────────────────────────────────
    const analyzeConfig = await readConfig()
    if (analyzeConfig.anthropic?.apiKey) {
      try {
        const counts = await getUnanalyzedCounts()
        const total = counts.avoma + counts.front

        if (total === 0) {
          log.push('analyze: nothing new to process')
        } else {
          log.push(`analyze: ${total} items queued (avoma: ${counts.avoma}, front: ${counts.front})`)

          const [avomaTranscripts, frontData, slack, trainingExamples] = await Promise.all([
            getUnanalyzedAvomaTranscripts(50),
            getUnanalyzedFrontConversations(25),
            readSlackRaw(),
            getTrainingExamples(),
          ])

          const avomaSlice =
            avomaTranscripts.length > 0
              ? { fetchedAt: new Date().toISOString(), meetings: [], transcripts: avomaTranscripts }
              : null

          const frontSlice =
            frontData.conversations.length > 0
              ? {
                  fetchedAt: new Date().toISOString(),
                  conversations: frontData.conversations,
                  messages: frontData.messages,
                }
              : null

          let savedCount = 0

          const newItems = await analyzeAllContent(
            analyzeConfig.anthropic.apiKey,
            avomaSlice,
            frontSlice,
            slack,
            [], // no in-memory dedup needed — DB already filtered
            {
              avoma: analyzeConfig.avoma?.instructions,
              front: analyzeConfig.front?.instructions,
              slack: analyzeConfig.slack?.instructions,
              general: analyzeConfig.anthropic?.instructions,
              product: analyzeConfig.anthropic?.productInstructions,
              service: analyzeConfig.anthropic?.serviceInstructions,
              churn: analyzeConfig.anthropic?.churnInstructions,
            },
            trainingExamples,
            async (batchItems: FeedbackItem[]) => {
              await appendFeedbackItems(batchItems)
              savedCount += batchItems.length
            },
            async (sourceIds: string[]) => {
              await markSourcesAnalyzed(sourceIds)
            }
          )

          await writeFeedbackStore({ lastAnalyzedAt: new Date().toISOString() })

          const stillRemaining = await getUnanalyzedCounts()
          log.push(
            `analyze: ${newItems.length} new feedback items extracted (${savedCount} saved). ` +
            `Still queued: avoma ${stillRemaining.avoma}, front ${stillRemaining.front}`
          )
        }
      } catch (err) {
        log.push(`analyze: failed — ${String(err)}`)
        console.error('[daily-sync] Analyze error:', err)
      }
    } else {
      log.push('analyze: Anthropic not configured, skipped')
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000)
    console.log(`[daily-sync] Done in ${elapsed}s:`, log)

    return NextResponse.json({ ok: true, elapsed: `${elapsed}s`, log })
  } catch (err) {
    console.error('[daily-sync] Fatal error:', err)
    return NextResponse.json({ error: String(err), log }, { status: 500 })
  }
}
