import { NextRequest, NextResponse } from 'next/server'
import {
  readFeedbackStore,
  writeFeedbackStore,
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

    const store = await readFeedbackStore()
    const item = store.items.find((i) => i.id === id)
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
      // Delete from store
      const updated = { ...store, items: store.items.filter((i) => i.id !== id) }
      await writeFeedbackStore(updated)
      return NextResponse.json({ ok: true, action: 'removed' })
    } else {
      // Update appType
      const updatedItem = { ...item, appType: targetType }
      const updated = {
        ...store,
        items: store.items.map((i) => (i.id === id ? updatedItem : i)),
      }
      await writeFeedbackStore(updated)
      return NextResponse.json({ ok: true, action: 'moved', item: updatedItem })
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
