/**
 * PayPal Webhook Handler
 * 
 * Processes payment events from PayPal
 * POST /api/payments/paypal/webhook
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPayPalWebhook } from '@/lib/payments/paypal'

// Use service role for database updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const headers: Record<string, string> = {}
    
    // Extract PayPal headers
    request.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('paypal-')) {
        headers[key.toLowerCase()] = value
      }
    })

    // Verify webhook signature if webhook ID is configured
    const webhookId = process.env.PAYPAL_WEBHOOK_ID
    if (webhookId) {
      const isValid = await verifyPayPalWebhook(webhookId, headers, body)
      if (!isValid) {
        console.error('[PayPal Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const event = JSON.parse(body)
    const eventType = event.event_type

    console.log('[PayPal Webhook] Event received:', eventType)

    // Handle different event types
    switch (eventType) {
      case 'CHECKOUT.ORDER.APPROVED':
        await handleOrderApproved(event.resource)
        break
      
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePaymentCompleted(event.resource)
        break
      
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
        await handlePaymentFailed(event.resource)
        break

      default:
        console.log('[PayPal Webhook] Unhandled event type:', eventType)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[PayPal Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleOrderApproved(resource: any) {
  try {
    const orderId = resource.id
    console.log('[PayPal Webhook] Order approved:', orderId)
    
    // The actual capture happens via the capture endpoint
    // This is just for logging/tracking
  } catch (error) {
    console.error('[PayPal Webhook] Error handling order approved:', error)
  }
}

async function handlePaymentCompleted(resource: any) {
  try {
    const captureId = resource.id
    const customId = resource.custom_id

    let metadata: { userId?: string; tierId?: string; billingCycle?: string } = {}
    try {
      metadata = JSON.parse(customId || '{}')
    } catch {
      console.error('[PayPal Webhook] Failed to parse custom_id:', customId)
    }

    const { userId, tierId, billingCycle } = metadata

    if (!userId || !tierId) {
      console.log('[PayPal Webhook] Payment completed but missing metadata:', captureId)
      return
    }

    // Calculate period dates
    const periodStart = new Date()
    const periodDays = billingCycle === 'yearly' ? 365 : 30
    const periodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000)

    // Update subscription
    const { data: existingSub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (existingSub) {
      await supabaseAdmin
        .from('user_subscriptions')
        .update({
          tier_id: tierId,
          billing_cycle: billingCycle || 'monthly',
          status: 'active',
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
    }

    // Reset usage tracking
    await supabaseAdmin
      .from('usage_tracking')
      .upsert({
        user_id: userId,
        query_count: 0,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    console.log('[PayPal Webhook] Subscription updated for user:', userId)
  } catch (error) {
    console.error('[PayPal Webhook] Error handling payment completed:', error)
  }
}

async function handlePaymentFailed(resource: any) {
  try {
    const captureId = resource.id

    // Find and update payment record
    await supabaseAdmin
      .from('payment_history')
      .update({ status: 'failed' })
      .eq('provider_transaction_id', captureId)

    console.log('[PayPal Webhook] Payment marked as failed:', captureId)
  } catch (error) {
    console.error('[PayPal Webhook] Error handling payment failed:', error)
  }
}
