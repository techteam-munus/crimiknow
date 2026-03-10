import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Admin client to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createServerClient()

  // Check if user is authenticated and is admin
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin status
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
  }

  try {
    // Get total users count
    const { count: totalUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })

    // Get active users (logged in within last 30 days using last_active column)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { count: activeUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('last_active', thirtyDaysAgo)

    // Get currently online users (active in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count: onlineUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('last_active', fiveMinutesAgo)

    // Get ALL subscription counts by tier (including all statuses)
    const { data: allSubscriptions } = await supabaseAdmin
      .from('user_subscriptions')
      .select(`
        tier_id,
        status,
        subscription_tiers (name)
      `)

    // Count subscriptions by tier name
    const subscriptionsByTier: Record<string, number> = {}
    const paidUsersCount = { count: 0 }
    
    allSubscriptions?.forEach((sub: { tier_id: string; status: string; subscription_tiers: { name: string } | null }) => {
      const tierName = sub.subscription_tiers?.name || 'unknown'
      subscriptionsByTier[tierName] = (subscriptionsByTier[tierName] || 0) + 1
      
      // Count paid users (not free tier and active status)
      if (tierName !== 'free' && sub.status === 'active') {
        paidUsersCount.count++
      }
    })

    // Count users without subscriptions as "free"
    const usersWithSubscriptions = allSubscriptions?.length || 0
    const usersWithoutSubscriptions = (totalUsers || 0) - usersWithSubscriptions
    if (usersWithoutSubscriptions > 0) {
      subscriptionsByTier['free'] = (subscriptionsByTier['free'] || 0) + usersWithoutSubscriptions
    }

    // Get total queries from all usage tracking records
    const { data: usageData } = await supabaseAdmin
      .from('usage_tracking')
      .select('query_count')

    const totalQueries = usageData?.reduce((sum, u) => sum + (u.query_count || 0), 0) || 0

    // Get recent signups (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: recentSignups } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo)

    // Get previous week signups for growth comparison
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { count: previousWeekSignups } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fourteenDaysAgo)
      .lt('created_at', sevenDaysAgo)

    // Calculate week-over-week growth rate
    const growthRate = previousWeekSignups && previousWeekSignups > 0
      ? (((recentSignups || 0) - previousWeekSignups) / previousWeekSignups) * 100
      : recentSignups || 0 > 0 ? 100 : 0

    // Get popular questions from chat_messages (role=user) since chat_sessions get pruned per user
    const { data: userMessages } = await supabaseAdmin
      .from('chat_messages')
      .select('content')
      .eq('role', 'user')

    const questionCounts: Record<string, number> = {}
    const originalCaseMap: Record<string, string> = {}
    userMessages?.forEach((m) => {
      const q = (m.content || '').trim()
      if (!q) return
      const key = q.toLowerCase()
      questionCounts[key] = (questionCounts[key] || 0) + 1
      if (!originalCaseMap[key]) {
        originalCaseMap[key] = q
      }
    })

    const popularQuestions = Object.entries(questionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => ({
        question: originalCaseMap[key] || key,
        hits: count,
      }))

    // Get revenue stats (from payment_history table)
    const { data: payments } = await supabaseAdmin
      .from('payment_history')
      .select('amount, status, created_at')
      .eq('status', 'completed')

    const totalRevenue = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0
    
    // Monthly revenue (current month)
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const monthlyRevenue = payments
      ?.filter(p => p.created_at >= monthStart)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      onlineUsers: onlineUsers || 0,
      recentSignups: recentSignups || 0,
      subscriptionsByTier,
      paidUsers: paidUsersCount.count,
      totalQueries,
      totalRevenue,
      monthlyRevenue,
      growthRate: Number(growthRate.toFixed(1)),
      popularQuestions,
    })
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
