'use client'

import Link from 'next/link'
import { MessageSquarePlus, BookOpen, LogOut, User, CreditCard, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CrimiKnowLogo } from '@/components/ui/crimiknow-logo'
import type { User as SupabaseUser } from '@supabase/supabase-js'

interface HeaderProps {
  onNewChat?: () => void
  user?: SupabaseUser | null
  onSignOut?: () => void
  onToggleMobileSidebar?: () => void
  showSidebarToggle?: boolean
}

export function Header({ onNewChat, user, onSignOut, onToggleMobileSidebar, showSidebarToggle }: HeaderProps) {
  const userInitial = user?.email?.charAt(0).toUpperCase() || 'U'
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <header className="sticky top-0 z-50 border-b border-green-200/60 bg-green-50/95 backdrop-blur supports-[backdrop-filter]:bg-green-50/80">
      <div className="flex items-center justify-between h-16 px-4 md:px-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <CrimiKnowLogo size="sm" />
          <p className="text-[12px] text-muted-foreground hidden sm:block">
            AI-Powered Philippine Criminal Law Library
          </p>
        </div>
        
        <div className="flex items-center gap-1">
          {showSidebarToggle && onToggleMobileSidebar && (
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden text-muted-foreground hover:text-red-600 hover:bg-green-100"
              onClick={onToggleMobileSidebar}
            >
              <History className="w-4 h-4 mr-2" />
              <span className="sr-only">Chat History</span>
            </Button>
          )}
          {onNewChat && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-red-600 hover:bg-green-100"
              onClick={onNewChat}
            >
              <MessageSquarePlus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-red-600 hover:bg-green-100"
            asChild
          >
            <a 
              href="https://www.officialgazette.gov.ph/1930/12/08/act-no-3815-s-1930/" 
              target="_blank" 
              rel="noopener noreferrer"
              title="View Revised Penal Code"
            >
              <BookOpen className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">RPC</span>
              <span className="sr-only">Revised Penal Code</span>
            </a>
          </Button>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 gap-2 text-muted-foreground hover:text-red-600 hover:bg-green-100"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-500 text-white text-xs font-medium">
                    {userInitial}
                  </div>
                  <span className="hidden md:inline text-sm">{userName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account" className="cursor-pointer">
                    <User className="w-4 h-4 mr-2" />
                    Account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/subscription" className="cursor-pointer">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Subscription
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="text-destructive cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
