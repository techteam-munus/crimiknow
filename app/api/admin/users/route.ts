import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Create admin client to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const search = searchParams.get('search') || ''
  const offset = (page - 1) * limit

  // Check if user is authenticated and is admin
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin status using admin client
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
  }

  try {
    // Fetch profiles with count (including last_active for online status)
    let profilesQuery = supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, created_at, updated_at, is_admin, last_active', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      profilesQuery = profilesQuery.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
    }

    const { data: profiles, count, error: profilesError } = await profilesQuery
    if (profilesError) throw profilesError

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        users: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      })
    }

    const userIds = profiles.map(p => p.id)

    // Fetch subscriptions for these users
    const { data: subscriptions } = await supabaseAdmin
      .from('user_subscriptions')
      .select(`
        user_id,
        tier_id,
        status,
        billing_cycle,
        current_period_end,
        subscription_tiers (name, price_monthly)
      `)
      .in('user_id', userIds)

    // Fetch usage tracking for these users
    const { data: usageData } = await supabaseAdmin
      .from('usage_tracking')
      .select('user_id, query_count, period_start, period_end')
      .in('user_id', userIds)

    // Create lookup maps
    const subscriptionMap = new Map(subscriptions?.map(s => [s.user_id, s]) || [])
    const usageMap = new Map(usageData?.map(u => [u.user_id, u]) || [])

    // Combine data
    const users = profiles.map(profile => ({
      ...profile,
      subscription: subscriptionMap.get(profile.id) || null,
      usage: usageMap.get(profile.id) || null,
    }))

    return NextResponse.json({
      users,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
