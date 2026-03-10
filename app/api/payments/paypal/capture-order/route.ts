/**
 * Captures a PayPal order after buyer approval (for JS SDK flow)
 * POST /api/payments/paypal/capture-order
 * 
 * Called by PayPal buttons onApprove callback
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { paypalConfig } from '@/lib/payments/config'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(
    `${paypalConfig.clientId}:${paypalConfig.clientSecret}`
  ).toString('base64')

  const response = await fetch(`${paypalConfig.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) throw new Error('Failed to authenticate with PayPal')
  const data = await response.json()
  return data.access_token
}

export async function POST(request: Request) {
  try {
    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const accessToken = await getAccessToken()

    // Capture the order
    const captureResponse = await fetch(
      `${paypalConfig.baseUrl}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text()
      console.error('[PayPal SDK] Capture failed:', errorText)
      return NextResponse.json({ error: 'Failed to capture payment' }, { status: 500 })
    }

    const captureData = await captureResponse.json()

    if (captureData.status !== 'COMPLETED') {
      return NextResponse.json({ error: `Payment status: ${captureData.status}` }, { status: 400 })
    }

    // Update payment record
    const { data: payment } = await supabaseAdmin
      .from('payment_history')
      .select('*')
      .eq('provider_transaction_id', orderId)
      .eq('status', 'pending')
      .single()

    if (payment) {
      await supabaseAdmin
        .from('payment_history')
        .update({
          status: 'completed',
          provider_transaction_id: captureData.id,
        })
        .eq('id', payment.id)

      // Update user subscription
      const periodStart = new Date()
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      // Get tier info from custom_id
      let tierId: string | null = null
      try {
        const purchaseUnit = captureData.purchase_units?.[0]
        if (purchaseUnit?.payments?.captures?.[0]?.custom_id) {
          const customData = JSON.parse(purchaseUnit.payments.captures[0].custom_id)
          tierId = customData.tierId
        } else if (purchaseUnit?.custom_id) {
          const customData = JSON.parse(purchaseUnit.custom_id)
          tierId = customData.tierId
        }
      } catch {
        // Fallback: get lowest paid tier
        const { data: tiers } = await supabaseAdmin
          .from('subscription_tiers')
          .select('id')
          .gt('price_monthly', 0)
          .order('price_monthly', { ascending: true })
          .limit(1)
        tierId = tiers?.[0]?.id || null
      }

      if (tierId) {
        const { data: existingSub } = await supabaseAdmin
          .from('user_subscriptions')
          .select('id')
          .eq('user_id', payment.user_id)
          .single()

        if (existingSub) {
          await supabaseAdmin
            .from('user_subscriptions')
            .update({
              tier_id: tierId,
              status: 'active',
              current_period_start: periodStart.toISOString(),
              current_period_end: periodEnd.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', payment.user_id)
        }

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
    }

    return NextResponse.json({
      success: true,
      transactionId: captureData.id,
      status: captureData.status,
    })
  } catch (error) {
    console.error('[PayPal SDK] Capture error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
