/**
 * PayMongo Payment Integration
 * 
 * Secure server-side integration with PayMongo API
 * Supports GCash, Maya, Cards, and other Philippine payment methods
 */

import { paymongoConfig, type PaymentIntent, type PaymentResult } from './config'

interface PayMongoCheckoutSession {
  id: string
  type: string
  attributes: {
    checkout_url: string
    payment_intent: {
      id: string
    }
    status: string
  }
}

interface PayMongoPaymentIntent {
  id: string
  type: string
  attributes: {
    status: string
    amount: number
    currency: string
    payment_method_allowed: string[]
  }
}

// Get authorization header for PayMongo
function getAuthHeader(): string {
  if (!paymongoConfig.isConfigured) {
    throw new Error('PayMongo is not configured. Please set PAYMONGO_SECRET_KEY.')
  }
  return `Basic ${Buffer.from(`${paymongoConfig.secretKey}:`).toString('base64')}`
}

// Create a PayMongo Checkout Session
export async function createPayMongoCheckout(
  intent: PaymentIntent,
  successUrl: string,
  cancelUrl: string
): Promise<PaymentResult> {
  try {
    // PayMongo expects amount in centavos (1 PHP = 100 centavos)
    const amountInCentavos = Math.round(intent.amount * 100)

    const checkoutData = {
      data: {
        attributes: {
          billing: {
            name: intent.metadata?.userName || 'CrimiKnow User',
            email: intent.metadata?.userEmail || '',
          },
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          line_items: [
            {
              currency: 'PHP',
              amount: amountInCentavos,
              description: intent.description,
              name: `CrimiKnow ${intent.billingCycle === 'yearly' ? 'Annual' : 'Monthly'} Subscription`,
              quantity: 1,
            },
          ],
          payment_method_types: [
            'gcash',
            'grab_pay',
            'paymaya',
            'card',
            'dob',
            'dob_ubp',
            'brankas_bdo',
            'brankas_landbank',
            'brankas_metrobank',
          ],
          success_url: successUrl,
          cancel_url: cancelUrl,
          reference_number: `CK-${intent.userId.slice(0, 8)}-${Date.now()}`,
          description: intent.description,
          metadata: {
            user_id: intent.userId,
            tier_id: intent.tierId,
            billing_cycle: intent.billingCycle,
          },
        },
      },
    }

    const response = await fetch(`${paymongoConfig.baseUrl}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(checkoutData),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[PayMongo] Failed to create checkout:', JSON.stringify(error))
      return {
        success: false,
        error: error.errors?.[0]?.detail || 'Failed to create PayMongo checkout',
      }
    }

    const result = await response.json()
    const session: PayMongoCheckoutSession = result.data

    return {
      success: true,
      transactionId: session.id,
      approvalUrl: session.attributes.checkout_url,
    }
  } catch (error) {
    console.error('[PayMongo] Error creating checkout:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PayMongo error',
    }
  }
}

// Retrieve a PayMongo Checkout Session
export async function getPayMongoCheckout(sessionId: string): Promise<{
  success: boolean
  status?: string
  paymentIntentId?: string
  metadata?: Record<string, string>
  error?: string
}> {
  try {
    const response = await fetch(
      `${paymongoConfig.baseUrl}/checkout_sessions/${sessionId}`,
      {
        headers: {
          'Authorization': getAuthHeader(),
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.errors?.[0]?.detail || 'Failed to retrieve checkout session',
      }
    }

    const result = await response.json()
    const session = result.data

    return {
      success: true,
      status: session.attributes.status,
      paymentIntentId: session.attributes.payment_intent?.id,
      metadata: session.attributes.metadata,
    }
  } catch (error) {
    console.error('[PayMongo] Error retrieving checkout:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PayMongo error',
    }
  }
}

// Retrieve PayMongo Payment Intent status
export async function getPayMongoPaymentIntent(paymentIntentId: string): Promise<{
  success: boolean
  status?: string
  error?: string
}> {
  try {
    const response = await fetch(
      `${paymongoConfig.baseUrl}/payment_intents/${paymentIntentId}`,
      {
        headers: {
          'Authorization': getAuthHeader(),
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const error = await response.json()
      return {
        success: false,
        error: error.errors?.[0]?.detail || 'Failed to retrieve payment intent',
      }
    }

    const result = await response.json()
    const paymentIntent: PayMongoPaymentIntent = result.data

    return {
      success: true,
      status: paymentIntent.attributes.status,
    }
  } catch (error) {
    console.error('[PayMongo] Error retrieving payment intent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PayMongo error',
    }
  }
}

// Verify PayMongo webhook signature
export function verifyPayMongoWebhook(
  payload: string,
  signature: string,
  webhookSecretKey: string
): boolean {
  try {
    const crypto = require('crypto')
    const [timestamp, testSignature, liveSignature] = signature.split(',').map(s => s.split('=')[1])
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecretKey)
      .update(`${timestamp}.${payload}`)
      .digest('hex')
    
    // Check both test and live signatures
    return expectedSignature === testSignature || expectedSignature === liveSignature
  } catch (error) {
    console.error('[PayMongo] Webhook verification failed:', error)
    return false
  }
}
