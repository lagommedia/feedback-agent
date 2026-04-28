import type { AvomaRawData, AvomaRawMeeting, AvomaRawTranscript } from '@/types'

const BASE_URL = 'https://api.avoma.com/v1'

function headers(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

async function fetchAllMeetings(apiKey: string, since?: Date): Promise<AvomaRawMeeting[]> {
  const meetings: AvomaRawMeeting[] = []
  const today = new Date().toISOString().split('T')[0]
  // is_internal=false filters at API level where supported; we also filter client-side below
  const params = new URLSearchParams({ limit: '100', to_date: today, is_internal: 'false' })
  if (since) {
    params.set('from_date', since.toISOString().split('T')[0])
  }
  let url: string | null = `${BASE_URL}/meetings?${params}`
  let page = 0

  while (url) {
    page++
    console.log(`[Avoma] Fetching meetings page ${page} …`)
    const res = await fetchWithRetry(url, apiKey)
    if (!res.ok) throw new Error(`Avoma meetings API error: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as { results?: AvomaRawMeeting[]; next?: string | null }
    // Client-side guard: drop any internal meetings that slipped through
    const external = (data.results ?? []).filter((m) => !m.is_internal)
    meetings.push(...external)
    console.log(`[Avoma] Page ${page}: ${external.length} external meetings (total so far: ${meetings.length})`)
    url = data.next ?? null
  }

  return meetings
}

async function fetchTranscript(
  apiKey: string,
  meeting: AvomaRawMeeting
): Promise<AvomaRawTranscript | null> {
  // Avoma uses a separate transcriptions endpoint keyed by transcription_uuid
  if (!meeting.transcription_uuid) return null

  const res = await fetchWithRetry(`${BASE_URL}/transcriptions/${meeting.transcription_uuid}`, apiKey)

  if (res.status === 404) return null
  if (!res.ok) return null

  const data = await res.json() as {
    transcript?: Array<{ transcript: string; speaker_id: number; timestamps: number[] }>
    speakers?: Array<{ id: number; name: string; email: string; is_rep: boolean }>
  }

  // Build speaker ID → name map
  const speakerMap = new Map<number, string>()
  for (const s of data.speakers ?? []) {
    speakerMap.set(s.id, s.name || s.email || 'Unknown')
  }

  // Normalize transcript segments
  const segments: AvomaRawTranscript['segments'] = []
  for (const seg of data.transcript ?? []) {
    const text = (seg.transcript ?? '').trim()
    if (!text) continue
    segments.push({
      speaker: speakerMap.get(seg.speaker_id) ?? `Speaker ${seg.speaker_id}`,
      text,
      start_time: seg.timestamps?.[0] ?? 0,
    })
  }

  if (segments.length === 0) return null

  return {
    meetingUuid: meeting.uuid,
    meetingTitle: meeting.subject,
    attendees: meeting.attendees ?? [],
    date: meeting.start_at,
    segments,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(url: string, apiKey: string, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000) // 30s timeout per request
    try {
      const res = await fetch(url, { headers: headers(apiKey), signal: controller.signal })
      clearTimeout(timer)
      if (res.status === 429) {
        // Parse wait time from Retry-After header or response body
        const retryAfter = res.headers.get('Retry-After')
        let waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000
        try {
          const body = await res.clone().json()
          const match = String(body.detail ?? '').match(/(\d+)\s*second/)
          if (match) waitMs = parseInt(match[1]) * 1000 + 1000
        } catch { /* use header fallback */ }
        await sleep(waitMs)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      if (attempt < retries - 1) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      throw err
    }
  }
  throw new Error('Avoma rate limit: max retries exceeded')
}

export async function syncAvoma(apiKey: string, since?: Date, knownUuids: Set<string> = new Set()): Promise<AvomaRawData> {
  const meetings = await fetchAllMeetings(apiKey, since)

  // Only fetch transcripts for external meetings that have a transcript ready
  // AND whose transcript isn't already stored — avoids re-fetching from Avoma API
  const meetingsWithTranscripts = meetings.filter(
    (m) => !m.is_internal && m.transcript_ready && m.transcription_uuid && !knownUuids.has(m.uuid)
  )

  console.log(`[Avoma] ${meetings.length} external meetings found, ${meetingsWithTranscripts.length} have transcripts ready`)

  const transcripts: AvomaRawTranscript[] = []
  const CONCURRENCY = 10 // Higher concurrency — transcript fetches are read-only and lightweight

  for (let i = 0; i < meetingsWithTranscripts.length; i += CONCURRENCY) {
    const batch = meetingsWithTranscripts.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map((m) => fetchTranscript(apiKey, m))
    )
    for (const t of results) {
      if (t) transcripts.push(t)
    }
    const fetched = Math.min(i + CONCURRENCY, meetingsWithTranscripts.length)
    console.log(`[Avoma] Transcripts: ${fetched}/${meetingsWithTranscripts.length} processed, ${transcripts.length} retrieved`)
    if (i + CONCURRENCY < meetingsWithTranscripts.length) {
      await sleep(100)
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    meetings,
    transcripts,
  }
}
