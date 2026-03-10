'use client'

import { useState, useCallback, useRef } from 'react'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  rating?: number
}

interface UseAzureChatOptions {
  api?: string
  sessionId?: string | null
  onError?: (error: Error) => void
  onResponse?: (response: Response) => void
  onSessionCreated?: (sessionId: string) => void
  onFinish?: () => void
}

const STREAM_END_DELIMITER = '__CRIMIKNOW_STREAM_END__'

export function useAzureChat(options: UseAzureChatOptions = {}) {
  const { api = '/api/chat', sessionId: initialSessionId, onError, onResponse, onSessionCreated, onFinish } = options
  
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const currentSessionId = useRef<string | null>(initialSessionId || null)
  const messagesRef = useRef<Message[]>([])
  const isLoadingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  messagesRef.current = messages
  isLoadingRef.current = isLoading

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoadingRef.current) return

    abortControllerRef.current?.abort()
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      createdAt: new Date(),
    }

    const assistantPlaceholderId = `assistant-${Date.now()}`
    const currentMessages = [...messagesRef.current, userMessage]
    
    setMessages([
      ...currentMessages,
      { id: assistantPlaceholderId, role: 'assistant', content: '', createdAt: new Date() }
    ])
    setIsLoading(true)
    setError(null)

    try {
      const apiMessages = currentMessages.map(m => ({ role: m.role, content: m.content }))

      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortController.signal,
      })

      onResponse?.(response)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(JSON.stringify(errorData))
      }

      const contentType = response.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        // Non-streaming (curated answer)
        const data = await response.json()
        if (data.sessionId) {
          currentSessionId.current = data.sessionId
          onSessionCreated?.(data.sessionId)
        }
        setMessages(prev => prev.map(m => {
          if (m.id === userMessage.id && data.userMessageId) return { ...m, id: data.userMessageId }
          if (m.id === assistantPlaceholderId) return {
            ...m,
            id: data.assistantMessageId || assistantPlaceholderId,
            content: data.content || 'No response received',
          }
          return m
        }))
      } else {
        // Streaming response
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let accumulated = ''
        let meta: Record<string, unknown> | null = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          accumulated += chunk

          const delimiterIdx = accumulated.indexOf(STREAM_END_DELIMITER)
          if (delimiterIdx !== -1) {
            const displayText = accumulated.substring(0, delimiterIdx).trimEnd()
            const metaStr = accumulated.substring(delimiterIdx + STREAM_END_DELIMITER.length).trim()
            try {
              meta = JSON.parse(metaStr)
            } catch {
              // Metadata split across chunks -- keep reading
              setMessages(prev => prev.map(m =>
                m.id === assistantPlaceholderId ? { ...m, content: displayText } : m
              ))
              continue
            }
            break
          }

          // Real-time display update
          setMessages(prev => prev.map(m =>
            m.id === assistantPlaceholderId ? { ...m, content: accumulated } : m
          ))
        }

        // Apply metadata (session, IDs, citation-linked content)
        if (meta) {
          if (meta.sessionId) {
            currentSessionId.current = meta.sessionId as string
            onSessionCreated?.(meta.sessionId as string)
          }

          const metaContent = meta.content as string | undefined
          const delimiterIdx = accumulated.indexOf(STREAM_END_DELIMITER)
          const rawText = delimiterIdx !== -1 ? accumulated.substring(0, delimiterIdx).trimEnd() : accumulated
          const finalContent = (metaContent && metaContent.length > 0) ? metaContent : rawText

          setMessages(prev => prev.map(m => {
            if (m.id === userMessage.id && meta!.userMessageId) return { ...m, id: meta!.userMessageId as string }
            if (m.id === assistantPlaceholderId) return {
              ...m,
              id: (meta!.assistantMessageId as string) || assistantPlaceholderId,
              content: finalContent,
            }
            return m
          }))
        }
      }

      onFinish?.()
    } catch (err) {
      if (abortController.signal.aborted) return
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      onError?.(error)
      let errorMsg = 'Sorry, something went wrong. Please try again.'
      try {
        const parsed = JSON.parse(error.message)
        if (parsed.message) errorMsg = parsed.message
      } catch { /* not JSON */ }
      setMessages(prev => prev.map(m =>
        m.id === assistantPlaceholderId
          ? { ...m, content: m.content || errorMsg }
          : m
      ))
    } finally {
      setIsLoading(false)
    }
  }, [api, onError, onResponse, onSessionCreated, onFinish])

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
    currentSessionId.current = null
  }, [])

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    clearMessages,
    sessionId: currentSessionId.current,
  }
}
