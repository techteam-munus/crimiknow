'use client'

import React from "react"

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  MessageSquare,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
  messageCount: number
}

interface ChatHistorySidebarProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewChat: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  refreshTrigger: number
}

const MIN_WIDTH = 200
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 280

export function ChatHistorySidebar({
  currentSessionId,
  onSelectSession,
  onNewChat,
  isCollapsed,
  onToggleCollapse,
  refreshTrigger,
}: ChatHistorySidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const isResizing = useRef(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/sessions?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' },
      })
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Refresh when trigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchSessions()
    }
  }, [refreshTrigger, fetchSessions])

  // Resize handlers (mouse + touch)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handlePointerUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  const handleDelete = async () => {
    if (!deleteSessionId) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/chat/sessions/${deleteSessionId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== deleteSessionId))
        if (currentSessionId === deleteSessionId) {
          onNewChat()
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    } finally {
      setIsDeleting(false)
      setDeleteSessionId(null)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()

    // Compare by calendar date, not timestamp diff
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffMs = nowDay.getTime() - dateDay.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-border bg-muted/30 flex flex-col items-center py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="mb-4"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewChat}
          title="New Chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <div
        ref={sidebarRef}
        className="relative border-r border-border bg-background flex flex-col shrink-0 h-full"
        style={{ width: sidebarWidth }}
      >
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-sm">Chat History</h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onNewChat}
              title="New Chat"
              className="h-8 w-8"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Session list - scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No chat history yet.
              <br />
              Start a new conversation!
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'group flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                    currentSessionId === session.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted',
                  )}
                  onClick={() => onSelectSession(session.id)}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug break-words line-clamp-2">
                      {session.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(session.created_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteSessionId(session.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Session count indicator */}
        {sessions.length > 0 && (
          <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground text-center shrink-0">
            {sessions.length} / 10 conversations
          </div>
        )}

        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-3 sm:w-2 h-full cursor-col-resize flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors z-10 group touch-none"
          onPointerDown={handlePointerDown}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>

      <AlertDialog
        open={!!deleteSessionId}
        onOpenChange={() => setDeleteSessionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
