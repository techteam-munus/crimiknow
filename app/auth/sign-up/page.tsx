'use client'

import React, { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CrimiKnowLogo } from '@/components/ui/crimiknow-logo'
import { Loader2, Eye, EyeOff } from 'lucide-react'

// Google Icon Component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function SignUpPageContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Get plan and redirect params from URL
  const planParam = searchParams.get('plan')
  const redirectParam = searchParams.get('redirect')

  const handleGoogleSignUp = async () => {
    setError(null)
    setIsGoogleLoading(true)

    try {
      // Build callback URL with plan info if present
      let callbackUrl = `${window.location.origin}/auth/callback`
      if (planParam && redirectParam === 'payment' && planParam !== 'free') {
        callbackUrl += `?plan=${planParam}&redirect=payment`
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true, // Prevent automatic redirect to check for errors first
        },
      })

      if (error) {
        setError(error.message)
        setIsGoogleLoading(false)
        return
      }
      
      if (data?.url) {
        // Manually redirect to Google OAuth
        window.location.href = data.url
      } else {
        setError('Google sign-up is not configured. Please enable it in Supabase Dashboard > Authentication > Providers > Google, or use email sign-up.')
        setIsGoogleLoading(false)
      }
    } catch {
      setError('An unexpected error occurred. Please try email sign-up instead.')
      setIsGoogleLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)

    try {
      // Use our API route that auto-confirms users
      const response = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      })

      const data = await response.json()

      if (!response.ok) {
        // If email already exists, try signing them in instead
        if (response.status === 409) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          })

          if (signInError) {
            setError('An account with this email already exists. Please sign in instead or use a different password.')
            setIsLoading(false)
            return
          }

          if (signInData.user) {
            // Successfully signed in existing user, redirect appropriately
            if (planParam && redirectParam === 'payment' && planParam !== 'free') {
              router.push(`/payment?plan=${planParam}`)
            } else {
              router.push('/chat')
            }
            return
          }
        }

        setError(data.error || 'Failed to create account')
        setIsLoading(false)
        return
      }

      // Account created, now sign them in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        // Account created but sign-in failed - show error and stay on page
        setError(`Account created but sign-in failed: ${signInError.message}. Please try signing in.`)
        setIsLoading(false)
        return
      }

      // Verify we actually have a user session before proceeding
      if (!signInData.user) {
        setError('Authentication failed. Please try signing in manually.')
        setIsLoading(false)
        return
      }

      // Send OTP for email verification
      try {
        const otpResponse = await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: signInData.user.id, 
            email 
          }),
        })

        if (!otpResponse.ok) {
          // OTP send failed, but account was created - redirect to login
          setError('Account created but failed to send verification code. Please sign in and verify later.')
          setIsLoading(false)
          return
        }

        const otpData = await otpResponse.json()

        // Build verify URL with optional test OTP for when email isn't configured
        let verifyUrl = planParam && redirectParam === 'payment' && planParam !== 'free'
          ? `/auth/verify-otp?plan=${planParam}&redirect=payment`
          : '/auth/verify-otp'
        
        // Pass testOtp for testing when SMTP isn't configured
        if (otpData.testOtp) {
          verifyUrl += (verifyUrl.includes('?') ? '&' : '?') + `testOtp=${otpData.testOtp}`
        }

        router.push(verifyUrl)
      } catch {
        setError('Account created but failed to send verification code. Please sign in and verify later.')
        setIsLoading(false)
        return
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4 py-8">
      <div className="h-1 bg-red-500 fixed top-0 left-0 right-0" />
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <CrimiKnowLogo size="lg" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
          <p className="text-muted-foreground text-sm mt-1 text-center">
            Get started with CrimiKnow - your AI-Powered Library for Philippine Criminal Law
          </p>
        </div>

        {/* Sign Up Form */}
        <div className="bg-white border border-green-200 rounded-xl p-6 shadow-sm">
          {/* Error Display */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm mb-4">
              {error}
              {error.includes('already exists') && (
                <Link 
                  href={planParam && redirectParam === 'payment' 
                    ? `/auth/login?plan=${planParam}&redirect=payment` 
                    : '/auth/login'
                  } 
                  className="block mt-2 text-red-700 hover:underline font-medium"
                >
                  Click here to sign in instead
                </Link>
              )}
            </div>
          )}

          {/* Google Sign Up Button - Hidden until Google OAuth is configured in Supabase */}
          {/* TODO: Unhide when Google OAuth provider is enabled in Supabase Dashboard */}
          {false && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full mb-4 bg-white border-gray-300 hover:bg-gray-50 text-foreground"
                onClick={handleGoogleSignUp}
                disabled={isGoogleLoading || isLoading}
              >
                {isGoogleLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <GoogleIcon className="w-5 h-5 mr-2" />
                )}
                Continue with Google
              </Button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">Or continue with email</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Juan dela Cruz"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Must be at least 6 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full bg-red-500 hover:bg-red-600 text-white" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/auth/login" className="text-red-500 hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          By creating an account, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-green-50"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>}>
      <SignUpPageContent />
    </Suspense>
  )
}
