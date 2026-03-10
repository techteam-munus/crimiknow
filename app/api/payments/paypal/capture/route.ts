/**
 * PayPal Payment Capture
 * 
 * Captures approved PayPal payments and updates subscription
 * GET /api/payments/paypal/capture?token=ORDER_ID
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { capturePayPalOrder } from '@/lib/payments/paypal'

// Use service role for database updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token') // PayPal order ID
    
    if (!token) {
      return NextResponse.redirect(new URL('/payment?error=missing_token', request.url))
    }

    // Capture the payment
    const result = await capturePayPalOrder(token)

    if (!result.success) {
      console.error('[PayPal Capture] Failed:', result.error)
      return NextResponse.redirect(
        new URL(`/payment?error=capture_failed&message=${encodeURIComponent(result.error || '')}`, request.url)
      )
    }

    // Find the pending payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payment_history')
      .select('*')
      .eq('provider_transaction_id', token)
      .eq('status', 'pending')
      .single()

    if (paymentError || !payment) {
      console.error('[PayPal Capture] Payment record not found:', token)
      // Still redirect to success since payment was captured
      return NextResponse.redirect(new URL('/payment/success?provider=paypal', request.url))
    }

    // Update payment status
    await supabaseAdmin
      .from('payment_history')
      .update({
        status: 'completed',
        provider_transaction_id: result.transactionId,
      })
      .eq('id', payment.id)

    // Get tier info from the payment metadata or fetch from recent payment
    // For now, we'll need to get this from a separate tracking mechanism
    // In production, store tier_id in payment_history metadata

    // Update user subscription (we need to get tierId from somewhere)
    // This is a simplified flow - in production, store tier info with payment
    const { data: tiers } = await supabaseAdmin
      .from('subscription_tiers')
      .select('id')
      .gt('price_monthly', 0)
      .order('price_monthly', { ascending: true })
      .limit(1)

    if (tiers && tiers.length > 0) {
      const periodStart = new Date()
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

      // Check for existing subscription
      const { data: existingSub } = await supabaseAdmin
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', payment.user_id)
        .single()

      if (existingSub) {
        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            tier_id: tiers[0].id,
            status: 'active',
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', payment.user_id)
      }

      // Reset usage tracking
      await supabaseAdmin
        .from('usage_tracking')
        .upsert({
          user_id: payment.user_id,
          query_count: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
    }

    return NextResponse.redirect(new URL('/payment/success?provider=paypal', request.url))
  } catch (error) {
    console.error('[PayPal Capture] Error:', error)
    return NextResponse.redirect(new URL('/payment?error=internal_error', request.url))
  }
}
