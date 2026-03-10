'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CrimiKnowIcon } from '@/components/ui/crimiknow-logo'
import { Check, ArrowLeft, Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

interface SubscriptionTier {
  id: string
  name: string
  description: string
  price_monthly: number
  price_yearly: number
  queries_per_month: number
  features: string[]
  is_active: boolean
}

interface UserSubscription {
  id: string
  tier_id: string
  status: string
  billing_cycle: string
  current_period_end: string
  subscription_tiers: SubscriptionTier
}

interface UsageTracking {
  query_count: number
  period_start: string
  period_end: string
}

export default function SubscriptionPage() {
  const [user, setUser] = useState<User | null>(null)
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [usage, setUsage] = useState<UsageTracking | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasUsedFreeTrial, setHasUsedFreeTrial] = useState(true) // default true to prevent flash
  const billingCycle = 'monthly' as const
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUser(user)

      // Fetch subscription tiers
      const { data: tiersData } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true })
      
      if (tiersData) setTiers(tiersData)

      // Fetch user's current subscription
      const { data: subData } = await supabase
        .from('user_subscriptions')
        .select('*, subscription_tiers(*)')
        .eq('user_id', user.id)
        .single()
      
      if (subData) setSubscription(subData)

      // Check if user has already used their free trial
      const { data: profileData } = await supabase
        .from('profiles')
        .select('has_used_free_trial')
        .eq('id', user.id)
        .single()
      
      if (profileData) setHasUsedFreeTrial(profileData.has_used_free_trial ?? true)

      // Fetch usage
      const { data: usageData } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', user.id)
        .order('period_start', { ascending: false })
        .limit(1)
        .single()
      
      if (usageData) setUsage(usageData)

      setIsLoading(false)
    }
    loadData()
  }, [router, supabase])

  const currentTier = subscription?.subscription_tiers

  const handleUpgrade = useCallback((tier: SubscriptionTier) => {
    if (!user) return
    
    const currentPrice = currentTier?.price_monthly || 0
    const newPrice = tier.price_monthly
    const action = newPrice > currentPrice ? 'upgrade' : newPrice < currentPrice ? 'downgrade' : 'subscribe'
    
    // Free plan: block if user has already used their free trial
    if (tier.price_monthly === 0) {
      if (hasUsedFreeTrial) {
        alert('You have already used your free trial. Please select a paid plan.')
        return
      }
      return
    }
    
    // Redirect to payment page for paid plans
    router.push(`/payment?plan=${tier.name.toLowerCase()}&tier_id=${tier.id}&billing=${billingCycle}&action=${action}`)
  }, [user, billingCycle, currentTier, router, supabase])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading subscription...</p>
        </div>
      </div>
    )
  }
  const queriesLimit = currentTier?.queries_per_month || 5
  const queriesUsed = usage?.query_count || 0
  const queriesRemaining = queriesLimit === -1 ? 'Unlimited' : Math.max(0, queriesLimit - queriesUsed)

  // Check subscription expiry for all plans
  const isFreeTier = currentTier?.name?.toLowerCase() === 'free'
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null
  const isExpired = periodEnd ? new Date() > periodEnd : false
  const daysUntilExpiry = periodEnd ? Math.ceil((periodEnd.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000)) : null
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 7

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between h-16 px-4 md:px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/chat">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Chat
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
              <CrimiKnowIcon className="w-5 h-5" />
            </div>
            <span className="font-semibold text-foreground">CrimiKnow</span>
          </div>
        </div>
      </header>

      <main className="px-4 py-8 max-w-6xl mx-auto">
        {/* Subscription Warning Banner */}
        {(isExpired || isExpiringSoon) && (
          <div className={`mb-6 p-4 rounded-lg border ${
            isExpired 
              ? 'bg-red-50 border-red-200' 
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                isExpired ? 'text-red-600' : 'text-amber-600'
              }`} />
              <div>
                <h3 className={`font-semibold ${
                  isExpired ? 'text-red-800' : 'text-amber-800'
                }`}>
                  {isExpired 
                    ? (isFreeTier ? 'Your Free Trial Has Expired' : 'Your Subscription Has Expired')
                    : `${isFreeTier ? 'Free Trial' : 'Subscription'} Expires in ${daysUntilExpiry} Day${daysUntilExpiry === 1 ? '' : 's'}`
                  }
                </h3>
                <p className={`text-sm mt-1 ${
                  isExpired ? 'text-red-700' : 'text-amber-700'
                }`}>
                  {isExpired 
                    ? (isFreeTier 
                        ? 'Your free trial has ended. Please upgrade to a paid plan to continue using CrimiKnow.' 
                        : 'Your subscription has expired. Please renew to continue using CrimiKnow.')
                    : (isFreeTier
                        ? 'Upgrade now to keep access to CrimiKnow and unlock more features.'
                        : 'Renew your subscription to maintain uninterrupted access.')
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Current Plan */}
        <section className="mb-12">
          <h1 className="text-3xl font-bold text-foreground mb-2">Subscription</h1>
          <p className="text-muted-foreground mb-6">Manage your subscription and usage</p>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-semibold text-foreground capitalize">
                    {currentTier?.name || 'Free'} Plan
                  </h2>
                  {isExpired ? (
                    <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      Expired
                    </span>
                  ) : (
                    <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {currentTier?.description || 'Basic access to CrimiKnow'}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-2xl sm:text-3xl font-bold text-foreground">
                  PHP {currentTier?.price_monthly || 0}
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                </p>
              </div>
            </div>

            {/* Usage */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Queries used this period</span>
                <span className="text-sm font-medium text-foreground">
                  {queriesUsed} / {queriesLimit === -1 ? 'Unlimited' : queriesLimit}
                </span>
              </div>
              {queriesLimit !== -1 && (
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, (queriesUsed / queriesLimit) * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {typeof queriesRemaining === 'number' 
                  ? `${queriesRemaining} queries remaining`
                  : 'Unlimited queries available'
                }
              </p>
            </div>
          </div>
        </section>

        {/* Upgrade Plans */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Upgrade Your Plan</h2>
              <p className="text-muted-foreground">Choose the plan that fits your needs</p>
            </div>
            
            <p className="text-sm text-muted-foreground">Billed monthly</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map((tier) => {
              const isCurrentPlan = currentTier?.id === tier.id
              const price = tier.price_monthly
              const isPopular = tier.name === 'professional'

              return (
                <div 
                  key={tier.id}
                  className={`relative bg-card border rounded-xl p-6 ${
                    isPopular ? 'border-primary shadow-lg' : 'border-border'
                  } ${isCurrentPlan ? 'ring-2 ring-primary/20' : ''}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Popular
                      </span>
                    </div>
                  )}

                  <h3 className="text-lg font-semibold text-foreground capitalize mb-1">
                    {tier.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">{tier.description}</p>
                  
                  <div className="mb-4">
                    <span className="text-3xl font-bold text-foreground">
                      PHP {price.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      /mo
                    </span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {(() => {
                    const isFree = tier.price_monthly === 0
                    const isTrialUsed = isFree && hasUsedFreeTrial
                    const isExpiredCurrentPlan = isCurrentPlan && isExpired
                    
                    let label = 'Upgrade'
                    if (isCurrentPlan && !isExpired) label = 'Current Plan'
                    else if (isExpiredCurrentPlan) label = 'Renew'
                    else if (isTrialUsed) label = 'Trial Used'
                    else if (isFree) label = 'Downgrade'
                    else if (tier.price_monthly < (currentTier?.price_monthly || 0)) label = 'Downgrade'

                    return (
                      <Button 
                        className="w-full" 
                        variant={isCurrentPlan && !isExpired ? 'outline' : isPopular ? 'default' : 'outline'}
                        disabled={(isCurrentPlan && !isExpired) || isTrialUsed}
                        onClick={() => handleUpgrade(tier)}
                      >
                        {label}
                      </Button>
                    )
                  })()}
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-8">
            Prices are in Philippine Pesos (PHP). Payment processing coming soon.
          </p>
        </section>
      </main>
    </div>
  )
}
