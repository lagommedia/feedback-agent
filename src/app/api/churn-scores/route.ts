import { NextResponse } from 'next/server'
import { getChurnScores } from '@/lib/storage'

export async function GET() {
  try {
    const scores = await getChurnScores()
    return NextResponse.json({ scores })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
