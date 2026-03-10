'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CrimiKnowLogo } from '@/components/ui/crimiknow-logo'
import { ArrowLeft, Check, CheckCircle2, CreditCard, Loader2, Shield, XCircle } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

interface SubscriptionTier {
  id: string
  name: string
  description: string
  price_monthly: number
  price_yearly: number
  queries_per_month: number
  features: string[]
}

// PayPal Icon
function PayPalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M7.076 21.337H2.47a.641.641 0 01-.633-.74L4.944 3.384a.77.77 0 01.757-.645h6.544c2.17 0 3.9.507 5.03 1.472.987.84 1.532 2.05 1.532 3.417 0 .39-.038.78-.112 1.163-.553 2.832-2.332 4.534-4.938 4.756a7.11 7.11 0 01-.708.035H9.882l-.943 5.7a.77.77 0 01-.76.645H7.076z" fill="#003087"/>
      <path d="M19.106 8.618c0 .293-.024.588-.073.884-.678 3.464-2.99 4.658-5.947 4.658h-.508a.73.73 0 00-.722.618l-.652 4.134-.185 1.17a.384.384 0 00.38.443h2.658a.64.64 0 00.633-.542l.026-.135.502-3.182.032-.176a.64.64 0 01.633-.542h.398c2.579 0 4.599-1.048 5.189-4.079.247-1.266.119-2.322-.533-3.065a2.54 2.54 0 00-.73-.572c-.28.186-.538.406-.77.656-.39.422-.702.92-.923 1.47a5.04 5.04 0 00-.408 1.76z" fill="#0070E0"/>
      <path d="M18.106 7.618a4.9 4.9 0 00-.606-.137 7.777 7.777 0 00-1.235-.09h-3.742a.639.639 0 00-.632.542l-.795 5.037-.023.147a.73.73 0 01.722-.618h1.508c2.957 0 5.27-1.194 5.947-4.658.02-.102.039-.203.055-.304a3.097 3.097 0 00-1.199-.919z" fill="#003087"/>
    </svg>
  )
}

// PayMongo Icon
function PayMongoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#22C55E"/>
      <path d="M6 8h12v2H6V8zm0 3h12v2H6v-2zm0 3h8v2H6v-2z" fill="white"/>
    </svg>
  )
}

// Minimal fallback only used while DB is loading
const planFallback = { name: 'Plan', price: 0, features: [] as string[] }

function PaymentPageContent() {
  const [user, setUser] = useState<User | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<'paypal' | 'paymongo' | 'pay_later' | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [tier, setTier] = useState<SubscriptionTier | null>(null)


  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const planParam = searchParams.get('plan') || 'free'
  const billingCycle = searchParams.get('billing') || 'monthly'
  const tierId = searchParams.get('tier_id')
  const action = searchParams.get('action') || 'subscribe' // subscribe, upgrade, or downgrade

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      // If user is not authenticated, redirect to sign-up with plan info
      if (!user) {
        const redirectUrl = `/auth/sign-up?plan=${planParam}&redirect=payment`
        router.push(redirectUrl)
        return
      }
      
      setUser(user)

      // Fetch tier from DB -- by tier_id or by plan name
      if (tierId) {
        const { data: tierData } = await supabase
          .from('subscription_tiers')
          .select('*')
          .eq('id', tierId)
          .single()
        if (tierData) setTier(tierData)
      } else {
        const { data: tierData } = await supabase
          .from('subscription_tiers')
          .select('*')
          .ilike('name', planParam)
          .single()
        if (tierData) setTier(tierData)
      }

      setIsLoading(false)
    }
    loadData()
  }, [supabase, tierId, planParam, router])

  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [paypalLoading, setPaypalLoading] = useState(false)
  const paypalContainerRef = useRef<HTMLDivElement>(null)
  const paypalScriptLoaded = useRef(false)
  const paypalButtonsRendered = useRef(false)

  // Load PayPal JS SDK and render buttons when PayPal is selected
  const loadPayPalSDK = useCallback(async () => {
    if (!user || paypalScriptLoaded.current) return

    setPaypalLoading(true)
    try {
      // Get client ID from server
      const res = await fetch('/api/payments/paypal/client-token')
      const { clientId } = await res.json()

      if (!clientId) {
        setPaymentError('PayPal is not configured. Please contact support.')
        setPaypalLoading(false)
        return
      }

      // Load PayPal JS SDK script
      const script = document.createElement('script')
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture&disable-funding=credit,card`
      script.async = true
      script.onload = () => {
        paypalScriptLoaded.current = true
        renderPayPalButtons()
      }
      script.onerror = () => {
        setPaymentError('Failed to load PayPal. Please try again.')
        setPaypalLoading(false)
      }
      document.head.appendChild(script)
    } catch {
      setPaymentError('Failed to initialize PayPal. Please try again.')
      setPaypalLoading(false)
    }
  }, [user])

  const renderPayPalButtons = useCallback(() => {
    if (!paypalContainerRef.current || paypalButtonsRendered.current) return
    if (!(window as any).paypal) return

    paypalButtonsRendered.current = true
    setPaypalLoading(false)

    const paypal = (window as any).paypal
    paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'gold',
        shape: 'rect',
        label: 'paypal',
        height: 45,
      },
      createOrder: async () => {
        setPaymentError(null)
        setIsProcessing(true)
        try {
          const response = await fetch('/api/payments/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tierId: tierId || planParam,
              billingCycle,
            }),
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error)
          return data.orderId
        } catch (error: any) {
          setPaymentError(error.message || 'Failed to create order')
          setIsProcessing(false)
          throw error
        }
      },
      onApprove: async (data: any) => {
        try {
          const response = await fetch('/api/payments/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.orderID }),
          })
          const result = await response.json()
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Payment capture failed')
          }
          setPaymentSuccess(true)
          setIsProcessing(false)
        } catch (error: any) {
          setPaymentError(error.message || 'Payment failed. Please try again.')
          setIsProcessing(false)
        }
      },
      onCancel: () => {
        setIsProcessing(false)
        setPaymentError('Payment was cancelled. Please try again.')
      },
      onError: (err: any) => {
        console.error('PayPal button error:', err)
        setIsProcessing(false)
        setPaymentError('Something went wrong with PayPal. Please try again.')
      },
    }).render(paypalContainerRef.current)
  }, [tierId, planParam, billingCycle])

  useEffect(() => {
    if (selectedMethod === 'paypal' && !paypalScriptLoaded.current) {
      loadPayPalSDK()
    }
    if (selectedMethod === 'paypal' && paypalScriptLoaded.current && !paypalButtonsRendered.current) {
      renderPayPalButtons()
    }
  }, [selectedMethod, loadPayPalSDK, renderPayPalButtons])

  // Handle PayMongo payment (redirect-based)
  const handlePayMongoPayment = async () => {
    if (!user) return

    setIsProcessing(true)
    setPaymentError(null)

    try {
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'paymongo',
          tierId: tierId || planParam,
          billingCycle,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Payment creation failed')

      if (data.approvalUrl) {
        const paymentWindow = window.open(data.approvalUrl, '_blank')
        if (!paymentWindow) {
          window.top ? window.top.location.href = data.approvalUrl : window.location.href = data.approvalUrl
        }
      } else {
        throw new Error('No approval URL received')
      }
    } catch (error) {
      console.error('Payment error:', error)
      setPaymentError(error instanceof Error ? error.message : 'Payment failed. Please try again.')
      setIsProcessing(false)
    }
  }

  // Handle Pay Later (testing only)
  const handlePayLater = async () => {
    if (!user) return

    setIsProcessing(true)
    setPaymentError(null)

    try {
      const response = await fetch('/api/payments/pay-later', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: tierId || planParam,
          billingCycle,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to activate subscription')

      setPaymentSuccess(true)
      setIsProcessing(false)
    } catch (error) {
      console.error('Pay Later error:', error)
      setPaymentError(error instanceof Error ? error.message : 'Failed to activate subscription.')
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-green-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  const displayPrice = tier ? (billingCycle === 'monthly' ? tier.price_monthly : tier.price_yearly) : planFallback.price
  const displayName = tier?.name || planFallback.name
  const displayFeatures = tier?.features || planFallback.features

  // Free plan doesn't need payment
  if (displayPrice === 0) {
    if (user) {
      router.push('/chat')
    } else {
      router.push('/auth/sign-up')
    }
    return null
  }

  // Payment success view
  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-green-50">
        <div className="h-1 bg-red-500" />
        <main className="flex-1 flex items-center justify-center px-4 py-12 min-h-[calc(100vh-4px)]">
          <div className="max-w-md w-full text-center">
            <div className="bg-white border border-green-200 rounded-xl p-8 shadow-sm">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Payment Successful!</h1>
              <p className="text-muted-foreground mb-6">
                Thank you for subscribing to the <span className="font-medium capitalize">{displayName}</span> plan.
                Your account has been upgraded.
              </p>
              <div className="space-y-3">
                <Link
                  href="/chat"
                  className="w-full inline-flex items-center justify-center gap-2 h-10 px-6 rounded-md text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
                >
                  Start Using CrimiKnow
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

  return (
    <div className="min-h-screen bg-green-50">
      {/* Red accent bar */}
      <div className="h-1 bg-red-500" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-green-200/60 bg-green-50/95 backdrop-blur">
        <div className="flex items-center justify-between h-16 px-4 md:px-6 max-w-7xl mx-auto">
          <Button variant="ghost" size="sm" asChild className="text-foreground hover:bg-green-100">
            <Link href={user ? '/subscription' : '/'}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
          <CrimiKnowLogo size="sm" />
        </div>
      </header>

      <main className="px-4 py-8 md:py-12 max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="bg-white border border-green-200 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Order Summary</h2>
            
            <div className="border-b border-green-100 pb-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground capitalize">{displayName} Plan</span>
                <span className="text-sm text-muted-foreground capitalize">{billingCycle}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {action === 'upgrade' ? 'Upgrade to ' : action === 'downgrade' ? 'Downgrade to ' : ''}{displayName} plan
              </p>
              
              <ul className="space-y-2">
                {displayFeatures.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between text-lg font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">PHP {displayPrice.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span></span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-white border border-green-200 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Payment Method</h2>
            <p className="text-sm text-muted-foreground mb-6">Select your preferred payment method</p>

            <div className="space-y-3 mb-6">
              {/* PayPal Option */}
              <button
                onClick={() => setSelectedMethod('paypal')}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                  selectedMethod === 'paypal'
                    ? 'border-red-500 bg-red-50'
                    : 'border-green-200 hover:border-green-300 bg-white'
                }`}
              >
                <div className="w-12 h-12 flex items-center justify-center bg-blue-50 rounded-lg">
                  <PayPalIcon className="w-8 h-8" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">PayPal</p>
                  <p className="text-sm text-muted-foreground">Pay securely with PayPal</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedMethod === 'paypal' ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}>
                  {selectedMethod === 'paypal' && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
              </button>

              {/* PayMongo Option */}
              <button
                onClick={() => setSelectedMethod('paymongo')}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                  selectedMethod === 'paymongo'
                    ? 'border-red-500 bg-red-50'
                    : 'border-green-200 hover:border-green-300 bg-white'
                }`}
              >
                <div className="w-12 h-12 flex items-center justify-center bg-green-100 rounded-lg">
                  <PayMongoIcon className="w-8 h-8" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">PayMongo</p>
                  <p className="text-sm text-muted-foreground">GCash, Maya, Cards & more</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedMethod === 'paymongo' ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}>
                  {selectedMethod === 'paymongo' && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
              </button>

              {/* Pay Later Option (Testing Only) */}
              {/* TODO: Remove this option before going to production */}
              <button
                onClick={() => setSelectedMethod('pay_later')}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all ${
                  selectedMethod === 'pay_later'
                    ? 'border-red-500 bg-red-50'
                    : 'border-green-200 hover:border-green-300 bg-white'
                }`}
              >
                <div className="w-12 h-12 flex items-center justify-center bg-amber-50 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-amber-600">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-foreground">Pay Later</p>
                  <p className="text-sm text-muted-foreground">Activate subscription now, pay later <span className="text-amber-600 font-medium">(Testing)</span></p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedMethod === 'pay_later' ? 'border-red-500 bg-red-500' : 'border-gray-300'
                }`}>
                  {selectedMethod === 'pay_later' && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
              </button>
            </div>

            {/* Error Message */}
            {paymentError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                <p className="text-sm text-red-600">{paymentError}</p>
              </div>
            )}

            {/* Security Notice */}
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg mb-6">
              <Shield className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Your payment information is encrypted and secure
              </p>
            </div>

            {/* PayPal Buttons (inline via JS SDK) */}
            {selectedMethod === 'paypal' && (
              <div className="space-y-3">
                {paypalLoading && (
                  <div className="flex items-center justify-center py-4 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading PayPal...</span>
                  </div>
                )}
                <div ref={paypalContainerRef} className={paypalLoading ? 'hidden' : ''} />
                {isProcessing && !paypalLoading && (
                  <div className="flex items-center justify-center py-2 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Processing payment...</span>
                  </div>
                )}
              </div>
            )}

            {/* PayMongo Pay Button */}
            {selectedMethod === 'paymongo' && (
              <Button
                onClick={handlePayMongoPayment}
                disabled={isProcessing}
                className="w-full bg-red-500 hover:bg-red-600 text-white h-12"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Pay PHP {displayPrice.toLocaleString()}
                  </>
                )}
              </Button>
            )}

            {/* Pay Later Button */}
            {selectedMethod === 'pay_later' && (
              <Button
                onClick={handlePayLater}
                disabled={isProcessing}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white h-12"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Activating Subscription...
                  </>
                ) : (
                  'Activate Subscription (Pay Later)'
                )}
              </Button>
            )}

            {/* No method selected */}
            {!selectedMethod && (
              <Button disabled className="w-full h-12 opacity-50">
                <CreditCard className="w-4 h-4 mr-2" />
                Select a payment method
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-green-50"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>}>
      <PaymentPageContent />
    </Suspense>
  )
}
