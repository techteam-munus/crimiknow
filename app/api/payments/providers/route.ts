import { NextResponse } from 'next/server'
import { paypalConfig, paymongoConfig } from '@/lib/payments/config'

export async function GET() {
  return NextResponse.json({
    paypal: paypalConfig.isConfigured,
    paymongo: paymongoConfig.isConfigured,
  })
}
