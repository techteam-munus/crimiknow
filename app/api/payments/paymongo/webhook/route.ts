/**
 * PayMongo Webhook Handler
 * 
 * Processes payment events from PayMongo
 * POST /api/payments/paymongo/webhook
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPayMongoWebhook } from '@/lib/payments/paymongo'

// Use service role for database updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const signature = request.headers.get('paymongo-signature')

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET
    if (webhookSecret && signature) {
      const isValid = verifyPayMongoWebhook(body, signature, webhookSecret)
      if (!isValid) {
        console.error('[PayMongo Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const event = JSON.parse(body)
    const eventType = event.data?.attributes?.type

    console.log('[PayMongo Webhook] Event received:', eventType)

    // Handle different event types
    switch (eventType) {
      case 'checkout_session.payment.paid':
        await handleCheckoutPaid(event.data.attributes.data)
        break
      
      case 'payment.paid':
        await handlePaymentPaid(event.data.attributes.data)
        break
      
      case 'payment.failed':
        await handlePaymentFailed(event.data.attributes.data)
        break

      default:
        console.log('[PayMongo Webhook] Unhandled event type:', eventType)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[PayMongo Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleCheckoutPaid(data: any) {
  try {
    const checkoutId = data.id
    const metadata = data.attributes?.metadata || {}
    const { user_id, tier_id, billing_cycle } = metadata

    if (!user_id || !tier_id) {
      console.error('[PayMongo Webhook] Missing metadata in checkout:', checkoutId)
      return
    }

    // Update payment status
    await supabaseAdmin
      .from('payment_history')
      .update({ status: 'completed' })
      .eq('provider_transaction_id', checkoutId)

    // Calculate period dates
    const periodStart = new Date()
    const periodDays = billing_cycle === 'yearly' ? 365 : 30
    const periodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000)

    // Update subscription
    const { data: existingSub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', user_id)
      .single()

    if (existingSub) {
      await supabaseAdmin
        .from('user_subscriptions')
        .update({
          tier_id,
          billing_cycle: billing_cycle || 'monthly',
          status: 'active',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user_id)
    } else {
      await supabaseAdmin
        .from('user_subscriptions')
        .insert({
          user_id,
          tier_id,
          billing_cycle: billing_cycle || 'monthly',
          status: 'active',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
        })
    }

    // Reset usage tracking
    await supabaseAdmin
      .from('usage_tracking')
      .upsert({
        user_id,
        query_count: 0,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    console.log('[PayMongo Webhook] Subscription updated for user:', user_id)
  } catch (error) {
    console.error('[PayMongo Webhook] Error handling checkout paid:', error)
  }
}

async function handlePaymentPaid(data: any) {
  try {
    const paymentId = data.id
    const metadata = data.attributes?.metadata || {}

    // Update payment record if exists
    await supabaseAdmin
      .from('payment_history')
      .update({ status: 'completed' })
      .eq('provider_transaction_id', paymentId)

    console.log('[PayMongo Webhook] Payment marked as completed:', paymentId)
  } catch (error) {
    console.error('[PayMongo Webhook] Error handling payment paid:', error)
  }
}

async function handlePaymentFailed(data: any) {
  try {
    const paymentId = data.id

    // Update payment record
    await supabaseAdmin
      .from('payment_history')
      .update({ status: 'failed' })
      .eq('provider_transaction_id', paymentId)

    console.log('[PayMongo Webhook] Payment marked as failed:', paymentId)
  } catch (error) {
    console.error('[PayMongo Webhook] Error handling payment failed:', error)
  }
}
