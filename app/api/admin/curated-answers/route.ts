import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const search = searchParams.get('search') || ''
  const ratingFilter = searchParams.get('rating') || 'all' // 'all', 'up', 'down', 'none'
  const offset = (page - 1) * limit

  let query = supabase
    .from('curated_answers')
    .select('*', { count: 'exact' })

  // Apply search filter
  if (search) {
    query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`)
  }

  // Apply rating filter
  if (ratingFilter === 'up') {
    query = query.eq('rating_status', 'thumbs_up')
  } else if (ratingFilter === 'down') {
    query = query.eq('rating_status', 'thumbs_down')
  } else if (ratingFilter === 'none') {
    query = query.eq('rating_status', 'unreviewed')
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    answers: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  })
}

// Manually add a curated answer
export async function POST(req: Request) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { question, answer, rating_status } = body

  if (!question || !answer) {
    return Response.json({ error: 'Question and answer are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('curated_answers')
    .insert({
      question: question.trim(),
      answer: answer.trim(),
      rating_status: rating_status || 'unreviewed',
      source_message_id: null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
