import { NextResponse } from 'next/server'
import { getCompanyAssignments, setCompanyAssignment } from '@/lib/storage'

export async function GET() {
  try {
    const assignments = await getCompanyAssignments()
    return NextResponse.json({ assignments })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { companyName, assignedTo } = await req.json()
    if (!companyName) return NextResponse.json({ error: 'companyName required' }, { status: 400 })
    await setCompanyAssignment(companyName, assignedTo ?? null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
