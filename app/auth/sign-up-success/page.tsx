import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CrimiKnowIcon as CrimiKnowLogo } from '@/components/ui/crimiknow-logo'
import { Mail } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mb-4">
            <CrimiKnowLogo className="w-8 h-8" />
          </div>
        </div>

        {/* Success Message */}
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mx-auto mb-6">
            <Mail className="w-8 h-8" />
          </div>
          
          <h1 className="text-2xl font-semibold text-foreground mb-2">Check your email</h1>
          <p className="text-muted-foreground mb-6">
            {"We've sent you a confirmation link. Please check your email to verify your account and get started with CrimiKnow."}
          </p>

          <div className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/auth/login">Back to Sign In</Link>
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          {"Didn't receive the email? Check your spam folder or try signing up again."}
        </p>
      </div>
    </div>
  )
}
