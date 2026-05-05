export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getChargebeeCustomers } from '@/lib/storage'

export async function GET() {
  try {
    const customers = await getChargebeeCustomers()
    return NextResponse.json({ customers })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
