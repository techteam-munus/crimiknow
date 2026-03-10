/**
 * Payment Configuration
 * 
 * Environment Variables Required:
 * 
 * PayPal:
 * - PAYPAL_CLIENT_ID: Your PayPal Client ID
 * - PAYPAL_CLIENT_SECRET: Your PayPal Client Secret
 * - PAYPAL_MODE: 'sandbox' or 'live'
 * 
 * PayMongo:
 * - PAYMONGO_SECRET_KEY: Your PayMongo Secret Key (sk_test_* or sk_live_*)
 * - PAYMONGO_PUBLIC_KEY: Your PayMongo Public Key (pk_test_* or pk_live_*)
 */

export const paypalConfig = {
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  mode: ((process.env.PAYPAL_MODE || 'sandbox').toLowerCase().includes('live') ? 'live' : 'sandbox') as 'sandbox' | 'live',
  get baseUrl() {
    return this.mode === 'live' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com'
  },
  get isConfigured() {
    return Boolean(this.clientId && this.clientSecret)
  }
}

export const paymongoConfig = {
  secretKey: process.env.PAYMONGO_SECRET_KEY || '',
  publicKey: process.env.PAYMONGO_PUBLIC_KEY || '',
  baseUrl: 'https://api.paymongo.com/v1',
  get isConfigured() {
    return Boolean(this.secretKey)
  }
}

export type PaymentProvider = 'paypal' | 'paymongo'

export interface PaymentIntent {
  provider: PaymentProvider
  amount: number
  currency: string
  description: string
  userId: string
  tierId: string
  billingCycle: 'monthly' | 'yearly'
  metadata?: Record<string, string>
}

export interface PaymentResult {
  success: boolean
  transactionId?: string
  approvalUrl?: string
  error?: string
}
