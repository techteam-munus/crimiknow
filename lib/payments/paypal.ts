/**
 * PayPal Payment Integration
 * 
 * Secure server-side integration with PayPal REST API
 * Supports subscriptions and one-time payments
 */

import { paypalConfig, type PaymentIntent, type PaymentResult } from './config'

interface PayPalAccessToken {
  access_token: string
  token_type: string
  expires_in: number
}

interface PayPalOrder {
  id: string
  status: string
  links: Array<{ href: string; rel: string; method: string }>
}

// Get PayPal access token using OAuth2
async function getAccessToken(): Promise<string> {
  if (!paypalConfig.isConfigured) {
    throw new Error('PayPal is not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.')
  }

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
    const error = await response.text()
    console.error('[PayPal] Failed to get access token:', error)
    throw new Error('Failed to authenticate with PayPal')
  }

  const data: PayPalAccessToken = await response.json()
  return data.access_token
}

// Create a PayPal order for payment
export async function createPayPalOrder(
  intent: PaymentIntent,
  returnUrl: string,
  cancelUrl: string
): Promise<PaymentResult> {
  try {
    const accessToken = await getAccessToken()

    // Convert PHP to USD for PayPal (approximate rate)
    // In production, use a real-time exchange rate API
    const amountUSD = (intent.amount / 56).toFixed(2)

    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `${intent.userId}_${intent.tierId}_${Date.now()}`,
          description: intent.description,
          custom_id: JSON.stringify({
            userId: intent.userId,
            tierId: intent.tierId,
            billingCycle: intent.billingCycle,
          }),
          amount: {
            currency_code: 'USD',
            value: amountUSD,
          },
        },
      ],
      application_context: {
        brand_name: 'CrimiKnow',
        locale: 'en-US',
        landing_page: 'LOGIN',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
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
      const error = await response.text()
      console.error('[PayPal] Failed to create order:', error)
      return { success: false, error: 'Failed to create PayPal order' }
    }

    const order: PayPalOrder = await response.json()
    const approvalLink = order.links.find(link => link.rel === 'approve') 
      || order.links.find(link => link.rel === 'payer-action')

    return {
      success: true,
      transactionId: order.id,
      approvalUrl: approvalLink?.href,
    }
  } catch (error) {
    console.error('[PayPal] Error creating order:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PayPal error',
    }
  }
}

// Capture a PayPal order after approval
export async function capturePayPalOrder(orderId: string): Promise<PaymentResult> {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
      `${paypalConfig.baseUrl}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('[PayPal] Failed to capture order:', error)
      return { success: false, error: 'Failed to capture PayPal payment' }
    }

    const data = await response.json()

    if (data.status === 'COMPLETED') {
      return {
        success: true,
        transactionId: data.id,
      }
    }

    return { success: false, error: `Payment status: ${data.status}` }
  } catch (error) {
    console.error('[PayPal] Error capturing order:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown PayPal error',
    }
  }
}

// Verify PayPal webhook signature
export async function verifyPayPalWebhook(
  webhookId: string,
  headers: Record<string, string>,
  body: string
): Promise<boolean> {
  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
      `${paypalConfig.baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: webhookId,
          webhook_event: JSON.parse(body),
        }),
      }
    )

    const data = await response.json()
    return data.verification_status === 'SUCCESS'
  } catch (error) {
    console.error('[PayPal] Webhook verification failed:', error)
    return false
  }
}
