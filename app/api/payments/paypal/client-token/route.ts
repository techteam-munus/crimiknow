/**
 * Returns the PayPal client ID for the JS SDK
 * GET /api/payments/paypal/client-token
 */

import { NextResponse } from 'next/server'
import { paypalConfig } from '@/lib/payments/config'

export async function GET() {
  if (!paypalConfig.isConfigured) {
    return NextResponse.json(
      { error: 'PayPal is not configured' },
      { status: 503 }
    )
  }

  return NextResponse.json({
    clientId: paypalConfig.clientId,
    mode: paypalConfig.mode,
  })
}
