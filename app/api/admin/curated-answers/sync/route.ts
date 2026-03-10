import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Admin client to bypass RLS - needed to read ALL users' chat messages
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Sync ALL chat Q&A pairs from chat_messages into curated_answers
export async function POST() {
  const supabase = await createServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify admin status using admin client to bypass RLS
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get ALL assistant messages across ALL users using admin client (bypasses RLS)
  const { data: assistantMessages, error: fetchError } = await supabaseAdmin
    .from('chat_messages')
    .select('id, content, rating, session_id, created_at')
    .eq('role', 'assistant')
    .order('created_at', { ascending: true })

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!assistantMessages || assistantMessages.length === 0) {
    return NextResponse.json({
      synced: 0,
      message: 'No assistant messages found to sync',
    })
  }

  // Get all existing curated answers to check both source_message_id and content duplicates
  const { data: existingCurated } = await supabaseAdmin
    .from('curated_answers')
    .select('source_message_id, question, answer')

  const existingIds = new Set(
    (existingCurated || [])
      .map((c) => c.source_message_id)
      .filter(Boolean),
  )

  // Build a set of existing question+answer content pairs (normalized) to prevent content duplicates
  const existingContentPairs = new Set(
    (existingCurated || []).map((c) =>
      `${(c.question || '').trim().toLowerCase()}|||${(c.answer || '').trim().toLowerCase()}`
    ),
  )

  // Filter to only unsynced messages (not already synced by source_message_id)
  const unsyncedMessages = assistantMessages.filter(
    (msg) => !existingIds.has(msg.id),
  )

  if (unsyncedMessages.length === 0) {
    return NextResponse.json({
      synced: 0,
      message: 'All messages are already synced',
    })
  }

  // Get all unique session_ids to batch-fetch user messages
  const sessionIds = [...new Set(unsyncedMessages.map((m) => m.session_id))]

  // Fetch ALL user messages for those sessions using admin client
  const { data: userMessages } = await supabaseAdmin
    .from('chat_messages')
    .select('id, content, session_id, created_at')
    .eq('role', 'user')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true })

  // Build a lookup: session_id -> array of user messages (sorted by created_at)
  const userMsgsBySession = new Map<
    string,
    Array<{ content: string; created_at: string }>
  >()
  for (const msg of userMessages || []) {
    if (!userMsgsBySession.has(msg.session_id)) {
      userMsgsBySession.set(msg.session_id, [])
    }
    userMsgsBySession.get(msg.session_id)!.push(msg)
  }

  // Build insert batch
  const toInsert: Array<{
    question: string
    answer: string
    rating_status: string
    source_message_id: string
    created_by: string
  }> = []

  for (const msg of unsyncedMessages) {
    // Find the user question that preceded this assistant answer in the same session
    const sessionUserMsgs = userMsgsBySession.get(msg.session_id) || []
    const precedingUserMsg = sessionUserMsgs
      .filter((u) => u.created_at < msg.created_at)
      .pop() // last user msg before this assistant msg

    if (!precedingUserMsg) continue

    // Skip if this exact question+answer content pair already exists
    const contentKey = `${precedingUserMsg.content.trim().toLowerCase()}|||${msg.content.trim().toLowerCase()}`
    if (existingContentPairs.has(contentKey)) continue

    // Also track within this batch to prevent duplicates from the current sync
    existingContentPairs.add(contentKey)

    // Map rating to rating_status
    let ratingStatus = 'unreviewed'
    if (msg.rating === 1) ratingStatus = 'thumbs_up'
    else if (msg.rating === -1) ratingStatus = 'thumbs_down'

    toInsert.push({
      question: precedingUserMsg.content,
      answer: msg.content,
      rating_status: ratingStatus,
      source_message_id: msg.id,
      created_by: user.id,
    })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      synced: 0,
      message: 'No new Q&A pairs found to sync (no matching user questions)',
    })
  }

  // Batch insert all at once
  const { error: insertError, data: inserted } = await supabaseAdmin
    .from('curated_answers')
    .insert(toInsert)
    .select('id')

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const syncedCount = inserted?.length || 0

  return NextResponse.json({
    synced: syncedCount,
    message: `Synced ${syncedCount} Q&A pair${syncedCount !== 1 ? 's' : ''} from chat history`,
  })
}
