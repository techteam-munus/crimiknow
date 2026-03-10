'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CrimiKnowLogo } from '@/components/ui/crimiknow-logo'
import { CheckCircle2, ArrowRight } from 'lucide-react'

function PaymentSuccessPageContent() {
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan') || 'basic'

  useEffect(() => {
    // Could trigger confetti or other celebration animation here
  }, [])

  return (
    <div className="min-h-screen bg-green-50 flex flex-col">
      {/* Red accent bar */}
      <div className="h-1 bg-red-500" />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <div className="bg-white border border-green-200 rounded-xl p-8 shadow-sm">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">Payment Successful!</h1>
            <p className="text-muted-foreground mb-6">
              Thank you for subscribing to the <span className="font-medium capitalize">{plan}</span> plan.
              Your account has been upgraded.
            </p>

            <div className="space-y-3">
              <Link
                href="/chat"
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-6 rounded-md text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Start Using CrimiKnow
                <ArrowRight className="w-4 h-4" />
              </Link>
              
              <Link
                href="/subscription"
                className="w-full inline-flex items-center justify-center h-10 px-6 rounded-md text-sm font-medium bg-white border border-green-300 hover:bg-green-100 text-foreground transition-colors"
              >
                View Subscription Details
              </Link>
            </div>
          </div>

          <div className="mt-8">
            <CrimiKnowLogo size="sm" className="justify-center" />
          </div>
        </div>
      </main>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-green-50"><CheckCircle2 className="w-8 h-8 animate-spin text-green-500" /></div>}>
      <PaymentSuccessPageContent />
    </Suspense>
  )
}
