import { NextResponse } from 'next/server'
import { readConfig, writeConfig, upsertChargebeeCustomers } from '@/lib/storage'
import { syncChargebeeCustomers } from '@/lib/chargebee'

export const maxDuration = 60

export async function POST() {
  try {
    const config = await readConfig()
    if (!config.chargebee?.apiKey || !config.chargebee?.site) {
      return NextResponse.json({ error: 'Chargebee is not configured' }, { status: 400 })
    }

    const customers = await syncChargebeeCustomers(config.chargebee.apiKey, config.chargebee.site)
    await upsertChargebeeCustomers(customers)

    await writeConfig({
      ...config,
      chargebee: { ...config.chargebee, lastSyncedAt: new Date().toISOString() },
    })

    return NextResponse.json({ status: 'success', count: customers.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const cause = err instanceof Error ? (err as NodeJS.ErrnoException).cause : undefined
    console.error('Chargebee sync error:', message, cause)
    return NextResponse.json({
      status: 'error',
      error: message,
      cause: cause ? String(cause) : undefined,
    }, { status: 500 })
  }
}
