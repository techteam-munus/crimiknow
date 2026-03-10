/**
 * Payment Creation API
 * 
 * Creates payment sessions for PayPal or PayMongo
 * POST /api/payments/create
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPayPalOrder } from '@/lib/payments/paypal'
import { createPayMongoCheckout } from '@/lib/payments/paymongo'
import { paypalConfig, paymongoConfig, type PaymentProvider } from '@/lib/payments/config'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { provider, tierId, billingCycle } = body as {
      provider: PaymentProvider
      tierId: string
      billingCycle: 'monthly' | 'yearly'
    }

    if (!provider || !tierId || !billingCycle) {
      return NextResponse.json(
        { error: 'Missing required fields: provider, tierId, billingCycle' },
        { status: 400 }
      )
    }

    // Validate provider
    if (provider !== 'paypal' && provider !== 'paymongo') {
      return NextResponse.json(
        { error: 'Invalid payment provider. Use "paypal" or "paymongo"' },
        { status: 400 }
      )
    }

    // Check if provider is configured
    if (provider === 'paypal' && !paypalConfig.isConfigured) {
      return NextResponse.json(
        { error: 'PayPal is not configured. Please contact support.' },
        { status: 503 }
      )
    }

    if (provider === 'paymongo' && !paymongoConfig.isConfigured) {
      return NextResponse.json(
        { error: 'PayMongo is not configured. Please contact support.' },
        { status: 503 }
      )
    }

    // Fetch the subscription tier
    const { data: tier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('id', tierId)
      .single()

    if (tierError || !tier) {
      return NextResponse.json(
        { error: 'Invalid subscription tier' },
        { status: 400 }
      )
    }

    // Get user profile for email
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single()

    const amount = billingCycle === 'monthly' ? tier.price_monthly : tier.price_yearly
    const description = `CrimiKnow ${tier.name} Plan - ${billingCycle === 'monthly' ? 'Monthly' : 'Annual'} Subscription`

    // Build return URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
      (request.headers.get('origin') ?? 'http://localhost:3000')
    
    const successUrl = `${baseUrl}/payment/success?provider=${provider}&tier=${tierId}&billing=${billingCycle}`
    const cancelUrl = `${baseUrl}/payment?plan=${tier.name}&tier_id=${tierId}&billing=${billingCycle}`

    // Create payment based on provider
    let result

    if (provider === 'paypal') {
      result = await createPayPalOrder(
        {
          provider,
          amount,
          currency: 'PHP',
          description,
          userId: user.id,
          tierId,
          billingCycle,
        },
        `${baseUrl}/api/payments/paypal/capture`,
        cancelUrl
      )
    } else {
      result = await createPayMongoCheckout(
        {
          provider,
          amount,
          currency: 'PHP',
          description,
          userId: user.id,
          tierId,
          billingCycle,
          metadata: {
            userName: profile?.full_name || 'CrimiKnow User',
            userEmail: profile?.email || user.email || '',
          },
        },
        successUrl,
        cancelUrl
      )
    }

    if (!result.success) {
      console.error('Payment creation failed for provider:', provider, 'error:', result.error)
      return NextResponse.json(
        { error: result.error || 'Failed to create payment' },
        { status: 500 }
      )
    }

    // Store pending payment in database
    await supabase.from('payment_history').insert({
      user_id: user.id,
      amount,
      currency: 'PHP',
      payment_method: provider,
      payment_provider: provider,
      provider_transaction_id: result.transactionId,
      status: 'pending',
    })

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      approvalUrl: result.approvalUrl,
    })
  } catch (error) {
    console.error('[Payment Create] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
