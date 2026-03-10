'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { ChatInterface } from '@/components/chat/chat-interface'
import { ChatHistorySidebar } from '@/components/chat/chat-history-sidebar'
import { Wrench } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

interface MaintenanceStatus {
  enabled: boolean
  isActive: boolean
  isScheduled: boolean
  message: string
  startTime: string
  endTime: string
}

export default function ChatPage() {
  const [chatKey, setChatKey] = useState(0)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFreeTier, setIsFreeTier] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) {
        // If there's a stale token error, sign out to clear it
        if (error?.message?.includes('Refresh Token') || error?.message?.includes('Failed to fetch')) {
          await supabase.auth.signOut()
        }
        router.push('/auth/login')
        return
      }
      setUser(user)

      // Check subscription tier
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('*, subscription_tiers(*)')
        .eq('user_id', user.id)
        .single()

      const tierName = subscription?.subscription_tiers?.name?.toLowerCase() || 'free'
      setIsFreeTier(tierName === 'free' || tierName === 'free trial')

      // Check admin status
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      setIsAdmin(!!profileData?.is_admin)

      // Check maintenance status
      try {
        const maintRes = await fetch('/api/maintenance/status')
        if (maintRes.ok) {
          const maintData = await maintRes.json()
          setMaintenance(maintData)
        }
      } catch {
        // ignore -- if we can't check, assume no maintenance
      }

      setIsLoading(false)
    }
    getUser()
  }, [router, supabase])

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null)
    setChatKey(prev => prev + 1)
    setMobileSidebarOpen(false)
  }, [])

  const handleSelectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId)
    setChatKey(prev => prev + 1)
    setMobileSidebarOpen(false)
  }, [])

  const handleSessionCreated = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId)
    setRefreshTrigger(prev => prev + 1)
  }, [])

  const handleMessageSent = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }, [router, supabase.auth])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-green-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Maintenance mode: block non-admin users
  if (maintenance?.isActive && !isAdmin) {
    const endTime = maintenance.endTime ? new Date(maintenance.endTime) : null
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0D1B2A] px-4">
        <div className="max-w-lg w-full text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mx-auto mb-6">
            <Wrench className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">
            System Maintenance
          </h1>
          <p className="text-white/60 mb-6 leading-relaxed">
            {maintenance.message || 'CrimiKnow is currently undergoing scheduled maintenance. We apologize for the inconvenience.'}
          </p>
          {endTime && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 border border-white/10 mb-6">
              <span className="text-sm text-white/50">Expected back:</span>
              <span className="text-sm font-medium text-white">
                {endTime.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
          )}
          <div className="pt-4">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center h-10 px-6 rounded-md text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Build maintenance banner info
  const showMaintenanceBanner = maintenance && (
    (maintenance.isScheduled) || // upcoming maintenance
    (maintenance.isActive && isAdmin) // admin sees it during active maintenance
  )
  const bannerMessage = maintenance?.isActive && isAdmin
    ? `Maintenance is ACTIVE. ${maintenance.message || 'Non-admin users are blocked.'}`
    : maintenance?.isScheduled
      ? `Scheduled maintenance: ${maintenance.message || 'System will be temporarily unavailable.'}`
      : ''
  const bannerStartTime = maintenance?.startTime || ''
  const bannerEndTime = maintenance?.endTime || ''

  return (
    <div className="flex flex-col h-screen bg-green-50">
      <div className="h-1 bg-red-500" />
      {showMaintenanceBanner && (
        <div className={`px-4 py-2.5 text-sm flex items-center justify-center gap-2 flex-wrap ${
          maintenance?.isActive ? 'bg-red-500 text-white' : 'bg-amber-50 text-amber-900 border-b border-amber-200'
        }`}>
          <Wrench className="w-4 h-4 shrink-0" />
          <span className="text-center">{bannerMessage}</span>
          {bannerStartTime && !maintenance?.isActive && (
            <span className="font-medium">
              Starts: {new Date(bannerStartTime).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
          {bannerEndTime && (
            <span className="font-medium">
              {maintenance?.isActive ? 'Expected back:' : 'Until:'}{' '}
              {new Date(bannerEndTime).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
        </div>
      )}
      <Header
        onNewChat={handleNewChat}
        user={user}
        onSignOut={handleSignOut}
        onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        showSidebarToggle={!isFreeTier}
      />
      <main className="flex-1 overflow-hidden flex relative">
        {/* Only show sidebar for non-free subscribers */}
        {!isFreeTier && (
          <>
            {/* Mobile overlay backdrop */}
            {mobileSidebarOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/40 md:hidden"
                onClick={() => setMobileSidebarOpen(false)}
              />
            )}
            {/* Desktop sidebar (always visible) */}
            <div className="hidden md:block h-full">
              <ChatHistorySidebar
                currentSessionId={currentSessionId}
                onSelectSession={handleSelectSession}
                onNewChat={handleNewChat}
                isCollapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                refreshTrigger={refreshTrigger}
              />
            </div>
            {/* Mobile sidebar (overlay drawer) */}
            <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-background transform transition-transform duration-200 ease-in-out md:hidden ${
              mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}>
              <ChatHistorySidebar
                currentSessionId={currentSessionId}
                onSelectSession={handleSelectSession}
                onNewChat={handleNewChat}
                isCollapsed={false}
                onToggleCollapse={() => setMobileSidebarOpen(false)}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </>
        )}
        <div className="flex-1 overflow-hidden">
          <ChatInterface
            key={chatKey}
            user={user}
            sessionId={currentSessionId}
            onSessionCreated={handleSessionCreated}
            onMessageSent={handleMessageSent}
            isFreeTier={isFreeTier}
          />
        </div>
      </main>
    </div>
  )
}
