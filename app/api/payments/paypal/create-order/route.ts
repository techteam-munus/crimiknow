/**
 * Creates a PayPal order for the JS SDK
 * POST /api/payments/paypal/create-order
 * 
 * Returns the order ID for the PayPal buttons to use
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { paypalConfig } from '@/lib/payments/config'

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

  if (!response.ok) {
    throw new Error('Failed to authenticate with PayPal')
  }

  const data = await response.json()
  return data.access_token
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tierId, billingCycle } = await request.json()

    if (!tierId || !billingCycle) {
      return NextResponse.json({ error: 'Missing tierId or billingCycle' }, { status: 400 })
    }

    // Fetch tier
    const { data: tier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('id', tierId)
      .single()

    if (tierError || !tier) {
      return NextResponse.json({ error: 'Invalid subscription tier' }, { status: 400 })
    }

    const amount = billingCycle === 'monthly' ? tier.price_monthly : tier.price_yearly
    const amountUSD = (amount / 56).toFixed(2)
    const description = `CrimiKnow ${tier.name} Plan - ${billingCycle === 'monthly' ? 'Monthly' : 'Annual'} Subscription`

    const accessToken = await getAccessToken()

    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `${user.id}_${tierId}_${Date.now()}`,
          description,
          custom_id: JSON.stringify({
            userId: user.id,
            tierId,
            billingCycle,
          }),
          amount: {
            currency_code: 'USD',
            value: amountUSD,
          },
        },
      ],
    }

    const response = await fetch(`${paypalConfig.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'PayPal-Request-Id': `crimiknow_${Date.now()}`,
      },
      body: JSON.stringify(orderData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[PayPal SDK] Order creation failed:', errorText)
      return NextResponse.json({ error: 'Failed to create PayPal order' }, { status: 500 })
    }

    const order = await response.json()

    // Store pending payment
    await supabase.from('payment_history').insert({
      user_id: user.id,
      amount,
      currency: 'PHP',
      payment_method: 'paypal',
      payment_provider: 'paypal',
      provider_transaction_id: order.id,
      status: 'pending',
    })

    return NextResponse.json({ orderId: order.id })
  } catch (error) {
    console.error('[PayPal SDK] Create order error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
