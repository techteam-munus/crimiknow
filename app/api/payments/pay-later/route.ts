/**
 * Pay Later - Testing only
 * POST /api/payments/pay-later
 * 
 * Activates a subscription without actual payment for testing purposes.
 * TODO: Remove or hide this route before going to production.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { tierId, billingCycle } = await request.json()

    if (!tierId) {
      return NextResponse.json({ error: 'Missing tierId' }, { status: 400 })
    }

    // Resolve tier - try UUID first, then by name
    let resolvedTierId = tierId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(tierId)) {
      const { data: tierData } = await supabaseAdmin
        .from('subscription_tiers')
        .select('id')
        .ilike('name', tierId)
        .single()
      
      if (tierData) {
        resolvedTierId = tierData.id
      } else {
        // Fallback: get lowest paid tier
        const { data: tiers } = await supabaseAdmin
          .from('subscription_tiers')
          .select('id')
          .gt('price_monthly', 0)
          .order('price_monthly', { ascending: true })
          .limit(1)
        resolvedTierId = tiers?.[0]?.id
      }
    }

    if (!resolvedTierId) {
      return NextResponse.json({ error: 'Could not resolve subscription tier' }, { status: 400 })
    }

    const periodStart = new Date()
    const periodEnd = billingCycle === 'yearly'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    // Create payment record as "pay_later"
    await supabaseAdmin
      .from('payment_history')
      .insert({
        user_id: user.id,
        amount: 0,
        currency: 'PHP',
        status: 'completed',
        payment_method: 'pay_later',
        payment_provider: 'pay_later',
        provider_transaction_id: `paylater_${Date.now()}`,
      })

    // Update or create subscription
    const { data: existingSub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existingSub) {
      await supabaseAdmin
        .from('user_subscriptions')
        .update({
          tier_id: resolvedTierId,
          status: 'active',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
    } else {
      await supabaseAdmin
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          tier_id: resolvedTierId,
          status: 'active',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
        })
    }

    // Reset usage tracking
    const { data: existingUsage } = await supabaseAdmin
      .from('usage_tracking')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existingUsage) {
      await supabaseAdmin
        .from('usage_tracking')
        .update({
          query_count: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
    } else {
      await supabaseAdmin
        .from('usage_tracking')
        .insert({
          user_id: user.id,
          query_count: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
        })
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription activated via Pay Later (testing)',
    })
  } catch (error) {
    console.error('[PayLater] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
