import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST - Update message rating
export async function POST(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const supabase = await createClient()
  const { messageId } = await params
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { rating } = body // -1, 0, or 1

  if (rating !== -1 && rating !== 0 && rating !== 1) {
    return NextResponse.json({ error: 'Invalid rating value' }, { status: 400 })
  }

  // Verify user owns the message's session
  const { data: message } = await supabase
    .from('chat_messages')
    .select(`
      id,
      chat_sessions (
        user_id
      )
    `)
    .eq('id', messageId)
    .single()

  if (!message || (message.chat_sessions as { user_id: string })?.user_id !== user.id) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  // Update rating
  const { error } = await supabase
    .from('chat_messages')
    .update({ rating })
    .eq('id', messageId)

  if (error) {
    console.error('Error updating rating:', error)
    return NextResponse.json({ error: 'Failed to update rating' }, { status: 500 })
  }

  return NextResponse.json({ success: true, rating })
}
