import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Admin client with service role for user deletion
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createServerClient()

  // Check if user is authenticated and is admin
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin status
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
  }

  // Prevent self-deletion
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  try {
    // Delete in order to respect foreign key constraints
    // 1. Delete chat messages
    await supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('user_id', userId)

    // 2. Delete chat sessions
    await supabaseAdmin
      .from('chat_sessions')
      .delete()
      .eq('user_id', userId)

    // 3. Delete usage tracking
    await supabaseAdmin
      .from('usage_tracking')
      .delete()
      .eq('user_id', userId)

    // 4. Delete OTP codes
    await supabaseAdmin
      .from('otp_codes')
      .delete()
      .eq('user_id', userId)

    // 5. Delete payment history
    await supabaseAdmin
      .from('payment_history')
      .delete()
      .eq('user_id', userId)

    // 6. Delete user subscriptions
    await supabaseAdmin
      .from('user_subscriptions')
      .delete()
      .eq('user_id', userId)

    // 7. Delete profile
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    // 8. Finally, delete the auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authError) {
      console.error('Error deleting auth user:', authError)
      // User data is already deleted, log but don't fail
    }

    return NextResponse.json({ success: true, message: 'User deleted successfully' })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}

// Get single user details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createServerClient()

  // Check if user is authenticated and is admin
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin status
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
  }

  try {
    const { data: userData, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        created_at,
        updated_at,
        is_admin,
        user_subscriptions (
          tier_id,
          status,
          billing_cycle,
          current_period_start,
          current_period_end,
          subscription_tiers (name, monthly_price, yearly_price, query_limit)
        ),
        usage_tracking (
          query_count,
          period_start,
          period_end
        ),
        payment_history (
          id,
          amount,
          currency,
          status,
          provider,
          created_at
        )
      `)
      .eq('id', userId)
      .single()

    if (error) throw error

    return NextResponse.json({ user: userData })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}
