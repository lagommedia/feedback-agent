import { NextRequest, NextResponse } from 'next/server'
import {
  getFeedbackItem,
  deleteFeedbackItem,
  updateFeedbackItemAppType,
  saveTrainingExample,
} from '@/lib/storage'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { action, targetType, notes } = await req.json()

    if (!notes || !notes.trim()) {
      return NextResponse.json({ error: 'Notes are required.' }, { status: 400 })
    }
    if (!['remove', 'move'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
    }
    if (action === 'move' && !['product', 'service', 'churn_risk'].includes(targetType)) {
      return NextResponse.json({ error: 'Invalid targetType.' }, { status: 400 })
    }

    const item = await getFeedbackItem(id)
    if (!item) {
      return NextResponse.json({ error: 'Feedback item not found.' }, { status: 404 })
    }

    // Save training example
    await saveTrainingExample({
      feedbackId: id,
      originalAppType: item.appType ?? 'product',
      correctAppType: action === 'remove' ? null : targetType,
      notes: notes.trim(),
      feedbackTitle: item.title,
      feedbackDescription: item.description,
    })

    if (action === 'remove') {
      await deleteFeedbackItem(id)
      return NextResponse.json({ ok: true, action: 'removed' })
    } else {
      await updateFeedbackItemAppType(id, targetType)
      return NextResponse.json({ ok: true, action: 'moved', item: { ...item, appType: targetType } })
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
