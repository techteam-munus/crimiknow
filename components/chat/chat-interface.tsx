'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAzureChat, type Message } from '@/hooks/use-azure-chat'
import { Send, Loader2, AlertTriangle, Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CrimiKnowLogo, MunusLogo } from '@/components/ui/crimiknow-logo'
import { cn } from '@/lib/utils'
import { ChatMessage } from './chat-message'
import { SamplePrompts } from './sample-prompts'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

const SAMPLE_PROMPTS = [
  {
    title: 'Theft vs. Robbery',
    prompt: 'What is the difference between theft and robbery under Philippine law?',
    icon: '?'
  },
  {
    title: 'Self-Defense',
    prompt: 'What are the elements of self-defense as a justifying circumstance?',
    icon: '?'
  },
  {
    title: 'Bail Rights',
    prompt: 'When is bail a matter of right and when is it discretionary?',
    icon: '?'
  },
  {
    title: 'Cybercrime Act',
    prompt: 'What acts are punishable under the Cybercrime Prevention Act?',
    icon: '?'
  },
  {
    title: 'Penalties Guide',
    prompt: 'Explain the classification of penalties under the Revised Penal Code',
    icon: '?'
  },
  {
    title: 'VAWC Law',
    prompt: 'What protection does the Anti-VAWC law provide to victims?',
    icon: '?'
  },
]

interface ExtendedMessage extends Message {
  id?: string
  rating?: number
}

interface ChatInterfaceProps {
  user?: User | null
  sessionId?: string | null
  onSessionCreated?: (sessionId: string) => void
  onMessageSent?: () => void
  isFreeTier?: boolean
}

export function ChatInterface({ user, sessionId, onSessionCreated, onMessageSent, isFreeTier = false }: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const [limitError, setLimitError] = useState<{ type: 'expired' | 'limit' | null; message: string } | null>(null)

  const [loadedMessages, setLoadedMessages] = useState<ExtendedMessage[]>([])
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  
  // Voice input state
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Check for Web Speech API support on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      setVoiceSupported(true)
    }
  }, [])

  const toggleVoice = useCallback(() => {
    if (isListening) {
      // Stop listening
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    setVoiceError(null)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    let finalTranscript = ''

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interim = transcript
        }
      }
      // Show interim results as they come in, append to existing input
      setInput(prev => {
        const base = prev.replace(/\u200B.*$/, '') // remove previous interim marker
        if (finalTranscript) return base + finalTranscript
        return base + '\u200B' + interim // zero-width space as interim marker
      })
    }

    recognition.onend = () => {
      setIsListening(false)
      // Clean up interim markers from the final text
      setInput(prev => prev.replace(/\u200B/g, ''))
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false)
      if (event.error === 'network') {
        setVoiceError('Voice input requires a secure connection. Please try on the deployed site.')
        setTimeout(() => setVoiceError(null), 5000)
      } else if (event.error === 'not-allowed') {
        setVoiceError('Microphone access denied. Please allow microphone permissions.')
        setTimeout(() => setVoiceError(null), 5000)
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setVoiceError('Voice input unavailable. Please type your question instead.')
        setTimeout(() => setVoiceError(null), 5000)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Stable callback refs to avoid recreating useCallback dependencies
  const onMessageSentRef = useRef(onMessageSent)
  const onSessionCreatedRef = useRef(onSessionCreated)
  onMessageSentRef.current = onMessageSent
  onSessionCreatedRef.current = onSessionCreated

  const stableOnFinish = useCallback(() => {
    onMessageSentRef.current?.()
  }, [])

  const stableOnSessionCreated = useCallback((id: string) => {
    sessionCreatedLocally.current = true
    onSessionCreatedRef.current?.(id)
  }, [])

  const stableOnError = useCallback((err: Error) => {
    try {
      const errorData = JSON.parse(err.message)
      if (errorData.code === 'FREE_TRIAL_EXHAUSTED') {
        setLimitError({ type: 'free_exhausted', message: errorData.message })
      } else if (errorData.code === 'FREE_TRIAL_EXPIRED' || errorData.code === 'SUBSCRIPTION_EXPIRED') {
        setLimitError({ type: 'expired', message: errorData.message })
      } else if (errorData.code === 'USAGE_LIMIT_REACHED') {
        setLimitError({ type: 'queries_exhausted', message: errorData.message })
      }
    } catch {
      // Not a JSON error, ignore
    }
  }, [])

  const { messages, sendMessage, isLoading, error } = useAzureChat({
    api: '/api/chat',
    sessionId: sessionId,
    onSessionCreated: stableOnSessionCreated,
    onFinish: stableOnFinish,

    onError: stableOnError,
  })

  const chatContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }

  // Track whether the session was created during this conversation (not loaded from history)
  const sessionCreatedLocally = useRef(false)

  // Load existing session messages -- only on initial mount or when switching to a history session
  useEffect(() => {
    if (!sessionId) {
      setLoadedMessages([])
      sessionCreatedLocally.current = false
      return
    }

    // Skip re-fetching if this session was created during the current conversation
    if (sessionCreatedLocally.current) return

    const loadSession = async () => {
      setIsLoadingSession(true)
      try {
        const res = await fetch(`/api/chat/sessions/${sessionId}`)
        if (res.ok) {
          const data = await res.json()
          setLoadedMessages(data.messages.map((m: { id: string; role: string; content: string; rating?: number }) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            rating: m.rating,
          })))
        }
      } catch (error) {
        console.error('Failed to load session:', error)
      } finally {
        setIsLoadingSession(false)
      }
    }

    loadSession()
  }, [sessionId])

  // Update user activity status periodically
  useEffect(() => {
    if (!user) return

    // Update activity immediately on mount
    const updateActivity = () => {
      fetch('/api/user/activity', { method: 'POST' }).catch(() => {})
    }
    
    updateActivity()

    // Update activity every 2 minutes while the page is open
    const interval = setInterval(updateActivity, 2 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user])

  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is updated before scrolling
    requestAnimationFrame(() => {
      scrollToBottom()
    })
  }, [messages, loadedMessages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    // Stop voice recognition if active
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    }
    // Clean up any interim markers before sending
    const cleanInput = input.replace(/\u200B/g, '').trim()
    if (!cleanInput) return
    sendMessage(cleanInput)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handlePromptClick = (prompt: string) => {
    if (isLoading) return
    sendMessage(prompt)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Subscription Limit Banner */}
      {limitError && (
        <div className={`border-b px-4 py-3 ${
          limitError.type === 'free_exhausted' ? 'bg-red-50 border-red-200' 
          : limitError.type === 'queries_exhausted' ? 'bg-orange-50 border-orange-200'
          : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 shrink-0 ${
              limitError.type === 'free_exhausted' ? 'text-red-600' 
              : limitError.type === 'queries_exhausted' ? 'text-orange-600'
              : 'text-amber-600'
            }`} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                limitError.type === 'free_exhausted' ? 'text-red-800' 
                : limitError.type === 'queries_exhausted' ? 'text-orange-800'
                : 'text-amber-800'
              }`}>
                {limitError.type === 'free_exhausted' ? 'Free Trial Ended' 
                  : limitError.type === 'queries_exhausted' ? 'Queries Used Up' 
                  : limitError.type === 'expired' ? 'Subscription Expired' 
                  : 'Query Limit Reached'}
              </p>
              <p className={`text-xs mt-0.5 ${
                limitError.type === 'free_exhausted' ? 'text-red-700' 
                : limitError.type === 'queries_exhausted' ? 'text-orange-700'
                : 'text-amber-700'
              }`}>{limitError.message}</p>
            </div>
            <Link href="/subscription">
              <Button size="sm" className={
                limitError.type === 'free_exhausted' ? 'bg-red-600 hover:bg-red-700 text-white' 
                : limitError.type === 'queries_exhausted' ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
              }>
                {limitError.type === 'free_exhausted' ? 'Subscribe Now' 
                  : limitError.type === 'queries_exhausted' ? 'Renew Plan' 
                  : limitError.type === 'expired' ? 'Renew Plan' 
                  : 'Upgrade Now'}
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Chat Messages Area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto">
        {isLoadingSession ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading conversation...</p>
            </div>
          </div>
        ) : messages.length === 0 && loadedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8">
            <div className="mb-6">
              <CrimiKnowLogo size="xl" />
            </div>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-3 text-center text-balance">
              How can I help you today?
            </h2>
            <p className="text-muted-foreground text-center max-w-lg mb-10 text-balance leading-relaxed text-sm md:text-base">
              Ask me anything about Philippine Criminal Law from the Revised Penal Code, special penal laws, administrative issuances, and court-decided cases or jurisprudence.
            </p>
            <SamplePrompts prompts={SAMPLE_PROMPTS} onPromptClick={handlePromptClick} />
          </div>
        ) : (
          <div className="max-w-6xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
            {/* Show loaded messages from session first, then new messages (excluding duplicates) */}
            {loadedMessages.map((message) => (
              <ChatMessage key={message.id} message={message} isFreeTier={isFreeTier} />
            ))}
            {messages
              .filter(msg => !loadedMessages.some(loaded => loaded.id === msg.id))
              .map((message) => {
                // Show thinking indicator for empty assistant messages while loading
                if (message.role === 'assistant' && !message.content && isLoading) {
                  return (
                    <div key={message.id} className="flex items-start gap-3 py-4">
                      <div className="w-8 h-8 rounded-full bg-green-800 flex items-center justify-center shrink-0">
                        <span className="text-white text-sm font-bold">C</span>
                      </div>
                      <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                        <span className="text-sm text-muted-foreground">CrimiKnow is thinking...</span>
                      </div>
                    </div>
                  )
                }
                // Skip empty assistant messages that are NOT loading (stale placeholders)
                if (message.role === 'assistant' && !message.content) return null
                return <ChatMessage key={message.id} message={message} isFreeTier={isFreeTier} />
              })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4">
          {voiceError && (
            <div className="mb-2 px-3 py-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {voiceError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-end gap-2 p-2 rounded-xl border border-green-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-red-300/30 focus-within:border-red-300 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about Philippine Criminal Law..."
                disabled={isLoading}
                rows={1}
                className={cn(
                  "flex-1 resize-none bg-transparent px-2 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50",
                  "min-h-[44px] max-h-[200px]"
                )}
              />
              {voiceSupported && (
                <Button
                  type="button"
                  size="icon"
                  variant={isListening ? 'default' : 'ghost'}
                  onClick={toggleVoice}
                  disabled={isLoading}
                  className={cn(
                    "shrink-0 h-10 w-10 rounded-lg transition-all",
                    isListening 
                      ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                  <span className="sr-only">{isListening ? 'Stop listening' : 'Voice input'}</span>
                </Button>
              )}
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="shrink-0 h-10 w-10 rounded-lg bg-red-500 hover:bg-red-600 text-white"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span className="sr-only">Send message</span>
              </Button>
            </div>
          </form>
          <div className="flex items-center justify-center gap-2 mt-3">
            <p className="text-xs text-muted-foreground text-center">
              CrimiKnow provides educational information only, not legal advice. 
              Consult a licensed lawyer for specific legal matters.
            </p>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <span className="text-[10px] text-muted-foreground/60">Powered by</span>
            <MunusLogo size="sm" className="h-3.5 w-auto opacity-60" />
          </div>
        </div>
      </div>
    </div>
  )
}
