import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET - Fetch user's chat sessions
export async function GET() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch sessions - limit to 10 most recent
  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select(`
      id,
      title,
      created_at,
      updated_at,
      chat_messages (
        id,
        content,
        role,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(10)
  
  // Delete sessions beyond the 10 most recent
  const { data: allSessions } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  
  if (allSessions && allSessions.length > 10) {
    const sessionsToDelete = allSessions.slice(10).map(s => s.id)
    // Delete associated messages first, then sessions
    await supabase
      .from('chat_messages')
      .delete()
      .in('session_id', sessionsToDelete)
    await supabase
      .from('chat_sessions')
      .delete()
      .in('id', sessionsToDelete)
  }

  if (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  // Format sessions with preview
  const formattedSessions = sessions?.map(session => {
    const firstUserMessage = session.chat_messages?.find((m: { role: string }) => m.role === 'user')
    return {
      id: session.id,
      title: session.title || firstUserMessage?.content?.substring(0, 50) || 'New Chat',
      created_at: session.created_at,
      updated_at: session.updated_at,
      messageCount: session.chat_messages?.length || 0,
    }
  }) || []

  return NextResponse.json({ sessions: formattedSessions })
}

// POST - Create a new chat session
export async function POST(request: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title } = body

  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: user.id,
      title: title || 'New Chat',
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating session:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  return NextResponse.json({ session })
}
