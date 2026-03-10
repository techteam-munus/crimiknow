import Image from 'next/image'
import { cn } from '@/lib/utils'

interface CrimiKnowLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'dark' | 'light'
}

interface MunusLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const CRIMIKNOW_LOGO_URL = '/images/crimiknow-logo.png'
const MUNUS_LOGO_URL = '/images/munus-horizontal-red.png'

// CrimiKnow Logo - Using the official wordmark
export function CrimiKnowLogo({ className, size = 'md', variant = 'dark' }: CrimiKnowLogoProps) {
  const sizeClasses = {
    sm: { width: 100, height: 30 },
    md: { width: 140, height: 42 },
    lg: { width: 180, height: 54 },
    xl: { width: 240, height: 72 }
  }

  return (
    <div className={cn('flex items-center', className)}>
      <Image 
        src={CRIMIKNOW_LOGO_URL}
        alt="CrimiKnow"
        width={sizeClasses[size].width}
        height={sizeClasses[size].height}
        className={cn('object-contain', variant === 'light' && 'brightness-0 invert')}
        priority
      />
    </div>
  )
}

// Munus Logo - Red horizontal version
export function MunusLogo({ className, size = 'sm' }: MunusLogoProps) {
  const sizeClasses = {
    sm: { width: 80, height: 24 },
    md: { width: 100, height: 30 },
    lg: { width: 120, height: 36 }
  }

  return (
    <Image 
      src={MUNUS_LOGO_URL}
      alt="Munus"
      width={sizeClasses[size].width}
      height={sizeClasses[size].height}
      className={cn('object-contain', className)}
    />
  )
}

// CD Asia Logo
const CDASIA_LOGO_URL = '/images/cdasia-logo.png'

export function CdAsiaLogo({ className, size = 'sm' }: MunusLogoProps & { size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    xs: { width: 80, height: 32 },
    sm: { width: 110, height: 44 },
    md: { width: 140, height: 56 },
    lg: { width: 180, height: 72 }
  }

  return (
    <div className={cn('inline-flex items-center justify-center rounded-lg bg-neutral-800 px-4 py-2.5', className)}>
      <Image 
        src={CDASIA_LOGO_URL}
        alt="CD Asia - Complete + Digital"
        width={sizeClasses[size].width}
        height={sizeClasses[size].height}
        className="object-contain"
      />
    </div>
  )
}

// Icon version for small displays - uses a simple "C" monogram with law styling
export function CrimiKnowIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn('w-5 h-5', className)}
    >
      {/* Stylized C with gavel accent */}
      <path 
        d="M22 8C19.5 5.5 15.5 5 12 7C8.5 9 6 13 6 17C6 21 8.5 25 12 27C15.5 29 19.5 28.5 22 26" 
        stroke="currentColor" 
        strokeWidth="3" 
        strokeLinecap="round"
        fill="none"
      />
      {/* Gavel head */}
      <rect x="18" y="12" width="10" height="5" rx="1" fill="currentColor" transform="rotate(45 23 14.5)" />
      {/* Gavel handle */}
      <rect x="24" y="18" width="3" height="8" rx="1" fill="currentColor" transform="rotate(45 25.5 22)" />
    </svg>
  )
}
