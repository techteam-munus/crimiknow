'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CrimiKnowLogo } from '@/components/ui/crimiknow-logo'
import { Loader2, Mail, ArrowLeft } from 'lucide-react'

function VerifyOTPPageContent() {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [currentTestOtp, setCurrentTestOtp] = useState<string | null>(null)
  const [testOtp, setTestOtp] = useState<string | null>(null) // Declare testOtp variable
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const planParam = searchParams.get('plan')
  const redirectParam = searchParams.get('redirect')
  const testOtpParam = searchParams.get('testOtp')

  // Set initial test OTP from URL params
  useEffect(() => {
    if (testOtpParam && !currentTestOtp) {
      setCurrentTestOtp(testOtpParam)
      setTestOtp(testOtpParam) // Set testOtp state
    }
  }, [testOtpParam, currentTestOtp])

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email || null)
        setUserId(user.id)
      } else {
        // No user, redirect to sign up
        router.push('/auth/sign-up')
      }
    }
    getUser()
  }, [supabase, router])

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const cleanValue = value.replace(/\D/g, '')
    
    if (cleanValue.length > 1) {
      // Handle paste - distribute digits across inputs
      const digits = cleanValue.slice(0, 6 - index).split('')
      const newOtp = [...otp]
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newOtp[index + i] = digit
        }
      })
      setOtp(newOtp)
      const nextIndex = Math.min(index + digits.length, 5)
      setTimeout(() => inputRefs.current[nextIndex]?.focus(), 0)
      return
    }

    // Single character input
    const digit = cleanValue.slice(0, 1)
    const newOtp = [...otp]
    newOtp[index] = digit
    setOtp(newOtp)

    // Auto-focus next input only if we entered a digit
    if (digit && index < 5) {
      setTimeout(() => inputRefs.current[index + 1]?.focus(), 0)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async () => {
    const otpCode = otp.join('')
    
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code')
      return
    }

    if (!userId || !userEmail) {
      setError('Session expired. Please sign up again.')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          email: userEmail, 
          otp: otpCode 
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to verify OTP')
        return
      }

      setSuccess('Email verified successfully! Redirecting...')
      
      // Redirect based on plan selection
      setTimeout(() => {
        if (planParam && redirectParam === 'payment' && planParam !== 'free') {
          router.push(`/payment?plan=${planParam}&billing=monthly`)
        } else {
          router.push('/chat')
        }
      }, 1500)
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (countdown > 0 || !userId || !userEmail) return

    setIsResending(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email: userEmail }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to resend OTP')
        return
      }

      // Update test OTP if email isn't configured
      if (data.testOtp) {
        setCurrentTestOtp(data.testOtp)
      }

      setSuccess(data.emailSent ? 'New code sent to your email!' : 'New verification code generated')
      setCountdown(60) // 60 second cooldown
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
      
      setTimeout(() => setSuccess(null), 3000)
    } catch {
      setError('Failed to resend OTP')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-background flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 border-b border-green-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/">
            <CrimiKnowLogo size="sm" />
          </Link>
          <Link 
            href="/auth/sign-up"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Sign Up
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Icon and Title */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Verify Your Email</h1>
            <p className="text-muted-foreground">
              We sent a 6-digit code to<br />
              <span className="font-medium text-foreground">{userEmail || 'your email'}</span>
            </p>
          </div>

          {/* Test OTP Banner - shown when SMTP is not configured */}
          {/* TODO: Remove this banner before going to production */}
          {testOtp && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4 text-center">
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wider mb-1">Testing Mode - Email Not Configured</p>
              <p className="text-sm text-amber-800 mb-2">Your verification code is:</p>
              <p className="text-3xl font-bold tracking-[0.3em] text-amber-900">{testOtp}</p>
              <p className="text-xs text-amber-600 mt-2">Enter this code below to verify your email</p>
            </div>
          )}

          {/* OTP Form */}
          <div className="bg-white border border-green-200 rounded-xl p-6 shadow-sm">
            {/* Error/Success Messages */}
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm mb-4">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-600 text-sm mb-4">
                {success}
              </div>
            )}

            {/* OTP Input */}
            <div className="flex justify-center gap-1.5 sm:gap-2 mb-6">
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={(e) => {
                    e.preventDefault()
                    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                    if (pastedData) {
                      handleOtpChange(0, pastedData)
                    }
                  }}
                  className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-semibold border-green-200 focus:border-green-500 focus:ring-green-500"
                  disabled={isLoading}
                />
              ))}
            </div>

            {/* Verify Button */}
            <Button
              onClick={handleVerify}
              disabled={isLoading || otp.join('').length !== 6}
              className="w-full bg-red-500 hover:bg-red-600 text-white mb-4"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Email'
              )}
            </Button>

            {/* Resend Link */}
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Didn't receive the code? </span>
              {countdown > 0 ? (
                <span className="text-muted-foreground">
                  Resend in {countdown}s
                </span>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={isResending}
                  className="text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
                >
                  {isResending ? 'Sending...' : 'Resend Code'}
                </button>
              )}
            </div>
          </div>

          {/* Help Text */}
          <p className="text-center text-xs text-muted-foreground mt-4">
          The code expires in 10 minutes. Check your spam folder if you don't see the email.
        </p>
        </div>
      </main>
    </div>
  )
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-green-50"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>}>
      <VerifyOTPPageContent />
    </Suspense>
  )
}
