import { NextResponse } from 'next/server'
import { getDistinctCustomers } from '@/lib/storage'

export async function GET() {
  try {
    const customers = await getDistinctCustomers()
    return NextResponse.json({ customers })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
