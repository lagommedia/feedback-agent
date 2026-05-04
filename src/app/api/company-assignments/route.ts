import { NextResponse } from 'next/server'
import { getCompanyAssignments, setCompanyAssignment, bulkAssignCompanyTickets } from '@/lib/storage'

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

    // When assigning a company, bulk-assign all currently-unassigned tickets to the same person.
    // Already manually assigned tickets are left untouched so re-assignments are preserved.
    let ticketsAssigned = 0
    if (assignedTo) {
      ticketsAssigned = await bulkAssignCompanyTickets(companyName, assignedTo)
    }

    return NextResponse.json({ ok: true, ticketsAssigned })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
