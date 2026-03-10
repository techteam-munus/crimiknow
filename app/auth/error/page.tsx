import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CrimiKnowIcon as CrimiKnowLogo } from '@/components/ui/crimiknow-logo'
import { AlertCircle } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mb-4">
            <CrimiKnowLogo className="w-8 h-8" />
          </div>
        </div>

        {/* Error Message */}
        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 text-destructive mx-auto mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          
          <h1 className="text-2xl font-semibold text-foreground mb-2">Authentication Error</h1>
          <p className="text-muted-foreground mb-6">
            Something went wrong during authentication. Please try again or contact support if the problem persists.
          </p>

          <div className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/auth/login">Try Again</Link>
            </Button>
            <Button asChild variant="outline" className="w-full bg-transparent">
              <Link href="/">Go Home</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
