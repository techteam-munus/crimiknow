import Link from 'next/link'
import Image from 'next/image'
import { CrimiKnowLogo, MunusLogo, CdAsiaLogo } from '@/components/ui/crimiknow-logo'
import { Check, MessageSquare, Shield, Clock, BookOpen, Scale, GraduationCap, Building2, ExternalLink, Sparkles, Search, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

const features = [
  {
    icon: MessageSquare,
    title: 'Instant Answers',
    description: 'Get immediate responses to your questions about the Revised Penal Code and special penal laws.'
  },
  {
    icon: BookOpen,
    title: 'Comprehensive Coverage',
    description: 'Access knowledge about criminal procedures, jurisprudence, and Philippine legal principles.'
  },
  {
    icon: Shield,
    title: 'Reliable Sources',
    description: 'Powered by AI with datasets curated and maintained by CD Asia, a trusted Philippine legal publisher.'
  },
  {
    icon: Clock,
    title: 'Available 24/7',
    description: 'Get help anytime you need it, whether studying for the bar or researching a case.'
  },
]

const audiences = [
  {
    icon: GraduationCap,
    title: 'Law Students & Professors',
    description: 'Prepare for bar exams and coursework with instant access to criminal law materials.'
  },
  {
    icon: Scale,
    title: 'Legal Practitioners',
    description: 'Research jurisprudence, penalties, and procedures for cases faster than ever.'
  },
  {
    icon: Building2,
    title: 'LGUs & Law Enforcement',
    description: 'Navigate criminal law provisions for local governance and enforcement operations.'
  },
]

const suggestions = [
  'Elements of Murder',
  'Revised Penal Code Art. 248',
  'Mitigating Circumstances',
]

const ctaMap: Record<string, string> = {
  free: 'Start Free',
  basic: 'Get Basic',
  professional: 'Get Professional',
  unlimited: 'Get Unlimited',
}

const popularTier = 'professional'

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: tiers } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  const pricingPlans = (tiers || []).map((tier) => {
    const tierKey = tier.name.toLowerCase()
    const isFree = tier.price_monthly === 0
    return {
      name: tier.name,
      price: tier.price_monthly.toLocaleString(),
      duration: '/month',
      description: tier.description || '',
      features: tier.features || [],
      cta: ctaMap[tierKey] || `Get ${tier.name}`,
      popular: tierKey === popularTier,
      href: isFree
        ? '/auth/sign-up?plan=free'
        : `/auth/sign-up?plan=${tierKey}&redirect=payment`,
    }
  })
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#01263a] border-b border-white/10">
        <div className="flex items-center justify-between h-14 md:h-16 px-4 md:px-6 max-w-7xl mx-auto">
          <CrimiKnowLogo size="sm" variant="light" className="md:hidden" />
          <CrimiKnowLogo size="md" variant="light" className="hidden md:flex" />
          <nav className="flex items-center gap-0.5 md:gap-1">
            <a 
              href="https://mymunus.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-8 md:h-9 px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              Munus
              <ExternalLink className="w-3 h-3 hidden sm:block" />
            </a>
            <a 
              href="https://ligala.law" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-8 md:h-9 px-2 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              Ligala
              <ExternalLink className="w-3 h-3 hidden sm:block" />
            </a>
          </nav>
          <div className="flex items-center gap-2 md:gap-3">
            <Link 
              href="/auth/login"
              className="hidden sm:inline-flex items-center justify-center h-8 md:h-9 px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              Sign In
            </Link>
            <Link 
              href="/auth/sign-up"
              className="inline-flex items-center justify-center h-8 md:h-9 px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section -- dark teal-navy matching Munus */}
      <section className="px-4 py-14 md:py-28 bg-[#01263a]">
        <div className="max-w-4xl mx-auto text-center">
          {/* AI Badge */}
          <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-green-500/30 bg-green-500/10 mb-8 md:mb-10">
            <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-400" />
            <span className="text-xs md:text-sm font-medium text-green-400">AI-Powered Legal Library</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-5 md:mb-6 text-balance leading-tight">
            Master Philippine Criminal Law with CrimiKnow
          </h1>
          <p className="text-base md:text-xl text-white/60 mb-8 md:mb-12 max-w-2xl mx-auto text-pretty leading-relaxed px-2">
            Get instant, accurate and reliable answers about crimes and penalties in the Philippines based on the Revised Penal Code, special penal laws, criminal procedures, administrative issuances, and court-decided cases or jurisprudence.
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-5 md:mb-6">
            <Link href="/auth/sign-up" className="block">
              <div className="flex items-center gap-2 md:gap-3 bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 md:px-5 py-3 md:py-4 hover:bg-white/15 transition-colors cursor-pointer">
                <Search className="w-4 h-4 md:w-5 md:h-5 text-green-400 shrink-0" />
                <span className="text-white/40 text-sm md:text-base flex-1 text-left truncate">Ask about crimes, penalties, jurisprudence, or legal doctrines...</span>
                <div className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg bg-red-500 shrink-0">
                  <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </div>
              </div>
            </Link>
          </div>

          {/* Suggestion Chips */}
          <div className="flex items-center justify-center gap-2 md:gap-3 flex-wrap mb-10 md:mb-14">
            <span className="text-xs md:text-sm text-white/40">Try:</span>
            {suggestions.map((s) => (
              <Link 
                key={s} 
                href="/auth/sign-up"
                className="inline-flex items-center px-3 md:px-4 py-1 md:py-1.5 rounded-full border border-white/15 text-xs md:text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                {s}
              </Link>
            ))}
          </div>

          {/* Data Provider Badge */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 pt-6 border-t border-white/10">
            <span className="text-xs text-white/40 uppercase tracking-wider">Datasets curated by</span>
            <a href="https://cdasia.com" target="_blank" rel="noopener noreferrer" className="hover:scale-105 transition-transform">
              <CdAsiaLogo size="sm" />
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-16 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-3 md:mb-4 text-balance">
            Why Choose CrimiKnow?
          </h2>
          <p className="text-sm md:text-base text-muted-foreground text-center mb-8 md:mb-12 max-w-2xl mx-auto leading-relaxed">
            Built specifically for Philippine criminal law study, practice and enforcement with datasets curated and maintained by CD Asia.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div 
                key={feature.title}
                className="bg-green-50 border border-green-200 rounded-xl p-6 hover:border-red-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-green-100 text-green-700 mb-4">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who Is It For Section */}
      <section className="px-4 py-16 md:py-24 bg-green-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-3 md:mb-4 text-balance">
            Who Is CrimiKnow For?
          </h2>
          <p className="text-sm md:text-base text-muted-foreground text-center mb-8 md:mb-12 max-w-2xl mx-auto leading-relaxed">
            CrimiKnow assists professionals and students across the Philippine legal and law enforcement landscape.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {audiences.map((audience) => (
              <div 
                key={audience.title}
                className="bg-white border border-green-200 rounded-xl p-8 text-center hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-100 text-green-700 mx-auto mb-5">
                  <audience.icon className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{audience.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{audience.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About CrimiKnow Section */}
      <section className="px-4 py-16 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="overflow-hidden rounded-xl md:rounded-2xl lg:rounded-3xl bg-gradient-to-br from-red-500 via-red-500 to-rose-600">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Photo */}
              <div className="relative p-4 sm:p-6 lg:p-8">
                <div className="relative overflow-hidden rounded-lg md:rounded-xl lg:rounded-2xl aspect-[4/3] lg:aspect-[3/4] xl:aspect-[4/3]">
                  <Image 
                    src="/images/about-photo.jpg"
                    alt="Legal professional doing research on a laptop"
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    loading="lazy"
                  />
                </div>
              </div>
              {/* Content */}
              <div className="flex flex-col justify-center px-5 pb-8 sm:px-8 sm:pb-10 lg:px-10 lg:py-12 xl:px-14">
                <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-white/70 mb-3 md:mb-4">About CrimiKnow</p>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 md:mb-6 text-balance leading-tight">
                  Smart way to do your legal research
                </h2>
                <p className="text-sm sm:text-base text-white/80 leading-relaxed mb-6 md:mb-8">
                  CrimiKnow is an AI-powered legal assistant tailored to Philippine criminal law, providing targeted support to both the Academe (law students, professors, bar reviewees/examiners) and Legal Professionals (lawyers, members of the judiciary, and relevant government agencies). We&apos;re committed to improving efficiency, accessibility, and accuracy in legal research and practice.
                </p>
                <div>
                  <Link 
                    href="/auth/sign-up"
                    className="inline-flex items-center justify-center h-10 md:h-11 px-6 md:px-8 py-2 rounded-lg text-sm font-semibold bg-white text-red-500 hover:bg-white/90 transition-colors cursor-pointer"
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="px-4 py-16 md:py-24 bg-green-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-3 md:mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-sm md:text-base text-muted-foreground text-center mb-8 md:mb-12 max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include access to our AI-powered 
            Philippine criminal law library.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
            {pricingPlans.map((plan) => (
              <div 
                key={plan.name}
                className={`bg-white border rounded-xl p-5 relative flex flex-col ${
                  plan.popular ? 'border-red-400 shadow-lg ring-1 ring-red-400' : 'border-green-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-red-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <h3 className="text-xl font-semibold text-foreground mb-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 min-h-[40px]">{plan.description}</p>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1 flex-wrap">
                    <span className="text-3xl font-bold text-foreground whitespace-nowrap">{plan.price === '0' ? 'FREE' : `PHP ${plan.price}`}</span>
                    <span className="text-sm text-muted-foreground">{plan.price !== '0' && plan.duration}</span>
                  </div>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link 
                  href={plan.href}
                  className={`w-full inline-flex items-center justify-center h-10 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    plan.popular 
                      ? 'bg-red-500 hover:bg-red-600 text-white' 
                      : 'bg-[#01263a] hover:bg-[#03344d] text-white'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-16 md:py-24 bg-[#01263a] text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 md:mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-sm md:text-base text-white/60 mb-6 md:mb-8 max-w-2xl mx-auto leading-relaxed">
            Join thousands of law students and practitioners who use CrimiKnow 
            to navigate the Philippine criminal law landscape.
          </p>
          <Link 
            href="/auth/sign-up"
            className="inline-flex items-center justify-center h-11 px-8 py-2 rounded-md text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer"
          >
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-10 md:py-12 border-t border-green-200 bg-green-50">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div className="flex flex-col gap-3">
              <CrimiKnowLogo size="sm" />
              <p className="text-sm text-muted-foreground max-w-xs">
                AI-powered library for Philippine criminal law. For educational and reference purposes only.
              </p>
            </div>
            {/* Links */}
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-foreground mb-1">Ecosystem</h4>
              <a href="https://mymunus.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                Munus <ExternalLink className="w-3 h-3" />
              </a>
              <a href="https://ligala.law" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                Ligala <ExternalLink className="w-3 h-3" />
              </a>
              <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Sign In
              </Link>
              <Link href="/auth/sign-up" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Create Account
              </Link>
            </div>
            {/* Partners */}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-foreground mb-1">Data Provider</h4>
              <a href="https://cdasia.com" target="_blank" rel="noopener noreferrer" className="inline-block">
                <CdAsiaLogo size="xs" />
              </a>
              <p className="text-xs text-muted-foreground">
                All legal datasets are curated and maintained by CD Asia.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-green-200">
            <p className="text-xs text-muted-foreground">
              2026 CrimiKnow. All rights reserved.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Powered by</span>
              <MunusLogo size="sm" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
