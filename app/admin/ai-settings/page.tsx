'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Bot,
  Check,
  Loader2,
  ArrowLeft,
  MessageSquareText,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface ModelOption {
  id: string
  name: string
  provider: string
  description: string
}

export default function AISettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // System prompt state
  const [systemPrompt, setSystemPrompt] = useState('')
  const [originalPrompt, setOriginalPrompt] = useState('')
  const [promptLoading, setPromptLoading] = useState(true)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)
  const [isDefaultPrompt, setIsDefaultPrompt] = useState(true)

  // Model state
  const [currentModel, setCurrentModel] = useState('')
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
  const [modelLoading, setModelLoading] = useState(true)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelSaved, setModelSaved] = useState(false)
  const [showCustomModel, setShowCustomModel] = useState(false)
  const [customModelId, setCustomModelId] = useState('')
  const [customModelError, setCustomModelError] = useState('')

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) { router.push('/chat'); return }
      setIsAdmin(true)
      setIsLoading(false)
    }
    checkAuth()
  }, [router, supabase])

  // Load system prompt
  useEffect(() => {
    if (!isAdmin) return
    const load = async () => {
      try {
        const res = await fetch('/api/admin/system-prompt')
        if (res.ok) {
          const data = await res.json()
          setSystemPrompt(data.prompt)
          setOriginalPrompt(data.prompt)
          setIsDefaultPrompt(data.isDefault)
        }
      } catch { /* ignore */ }
      setPromptLoading(false)
    }
    load()
  }, [isAdmin])

  // Load model config
  useEffect(() => {
    if (!isAdmin) return
    const load = async () => {
      try {
        const res = await fetch('/api/admin/model')
        if (res.ok) {
          const data = await res.json()
          setCurrentModel(data.currentModel)
          setAvailableModels(data.models)
        }
      } catch { /* ignore */ }
      setModelLoading(false)
    }
    load()
  }, [isAdmin])

  // Save system prompt
  const handlePromptSave = useCallback(async () => {
    setPromptSaving(true)
    try {
      const res = await fetch('/api/admin/system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: systemPrompt }),
      })
      if (res.ok) {
        const data = await res.json()
        setOriginalPrompt(data.prompt)
        setSystemPrompt(data.prompt)
        setIsDefaultPrompt(data.isDefault)
        setPromptSaved(true)
        setTimeout(() => setPromptSaved(false), 3000)
      }
    } catch { /* ignore */ }
    setPromptSaving(false)
  }, [systemPrompt])

  // Reset to default
  const handlePromptReset = useCallback(async () => {
    setPromptSaving(true)
    try {
      const res = await fetch('/api/admin/system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '' }),
      })
      if (res.ok) {
        const data = await res.json()
        setSystemPrompt(data.prompt)
        setOriginalPrompt(data.prompt)
        setIsDefaultPrompt(true)
        setPromptSaved(true)
        setTimeout(() => setPromptSaved(false), 3000)
      }
    } catch { /* ignore */ }
    setPromptSaving(false)
  }, [])

  // Save model selection
  const handleModelChange = useCallback(async (modelId: string) => {
    setModelSaving(true)
    try {
      const res = await fetch('/api/admin/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      })
      if (res.ok) {
        setCurrentModel(modelId)
        setModelSaved(true)
        setTimeout(() => setModelSaved(false), 3000)
      }
    } catch { /* ignore */ }
    setModelSaving(false)
  }, [])

  // Save custom model
  const handleCustomModelSave = useCallback(async () => {
    const trimmed = customModelId.trim()
    if (!trimmed) return
    if (!/^[\w-]+\/[\w.:\-]+$/.test(trimmed)) {
      setCustomModelError('Format must be provider/model-name')
      return
    }
    await handleModelChange(trimmed)
    setShowCustomModel(false)
    setCustomModelId('')
    setCustomModelError('')
  }, [customModelId, handleModelChange])

  const hasPromptChanges = systemPrompt !== originalPrompt

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-green-50">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-green-50">
      <div className="h-1 bg-red-500" />
      <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">AI Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure the AI model and system prompt used for generating responses.
          </p>
        </div>

        {/* Model Selection Card */}
        <Card className="mb-6">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Bot className="h-5 w-5 shrink-0" />
                Model Configuration
              </CardTitle>
              <CardDescription className="mt-1">Select the language model used for generating responses</CardDescription>
            </div>
            {modelSaved && (
              <div className="flex items-center gap-1 text-sm text-green-600 shrink-0">
                <Check className="h-4 w-4" />
                Saved
              </div>
            )}
          </CardHeader>
          <CardContent>
            {modelLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <Select
                    value={availableModels.some(m => m.id === currentModel) ? currentModel : ''}
                    onValueChange={(v) => { setShowCustomModel(false); handleModelChange(v); }}
                    disabled={modelSaving}
                  >
                    <SelectTrigger className="w-full sm:w-[400px]">
                      <SelectValue placeholder={availableModels.some(m => m.id === currentModel) ? 'Select a model' : `Custom: ${currentModel}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set(availableModels.map(m => m.provider))).map(provider => (
                        <SelectGroup key={provider}>
                          <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{provider}</SelectLabel>
                          {availableModels.filter(m => m.provider === provider).map(model => (
                            <SelectItem key={model.id} value={model.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">{model.name}</span>
                                <span className="text-xs text-muted-foreground">{model.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  {modelSaving && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCustomModel(!showCustomModel)}
                    className="text-xs shrink-0"
                  >
                    {showCustomModel ? 'Cancel' : 'Use custom model ID'}
                  </Button>
                  <p className="text-xs text-muted-foreground break-all">
                    Active: <span className="font-mono font-medium text-foreground">{currentModel}</span>
                  </p>
                </div>

                {showCustomModel && (
                  <div className="flex flex-col gap-2 rounded-md border p-4 bg-muted/30">
                    <Label className="text-sm font-medium">Custom Model ID</Label>
                    <p className="text-xs text-muted-foreground">
                      Enter any valid AI Gateway model string. Format: <span className="font-mono">provider/model-name</span>
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="e.g. bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0"
                        value={customModelId}
                        onChange={(e) => { setCustomModelId(e.target.value); setCustomModelError(''); }}
                        className="font-mono text-sm flex-1 min-w-0"
                        onKeyDown={(e) => e.key === 'Enter' && handleCustomModelSave()}
                      />
                      <Button onClick={handleCustomModelSave} disabled={modelSaving || !customModelId.trim()} size="sm" className="shrink-0">
                        Save
                      </Button>
                    </div>
                    {customModelError && (
                      <p className="text-xs text-red-500">{customModelError}</p>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Changes take effect on the next user query. No restart or deploy needed.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Prompt Card */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 shrink-0" />
                System Prompt
              </CardTitle>
              <CardDescription>
                The instructions given to the AI model before each conversation.
                {isDefaultPrompt && (
                  <span className="ml-2 text-xs text-amber-600 font-medium">Using default</span>
                )}
              </CardDescription>
            </div>
            {promptSaved && (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Saved
              </div>
            )}
          </CardHeader>
          <CardContent>
            {promptLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="space-y-4">
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={16}
                  className="font-mono text-sm leading-relaxed resize-y min-h-[200px]"
                  placeholder="Enter system prompt instructions..."
                />
                <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={handlePromptSave}
                      disabled={promptSaving || !hasPromptChanges}
                      size="sm"
                    >
                      {promptSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </Button>
                    {!isDefaultPrompt && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePromptReset}
                        disabled={promptSaving}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset to Default
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {systemPrompt.length} characters
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Changes take effect on the next user query. The citation rules are appended automatically and are not shown here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
