import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Available models grouped by provider
// Keep this list updated as new models become available
export const AVAILABLE_MODELS = [
  // Google (zero config on Vercel AI Gateway)
  { id: 'google/gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Google', description: 'Fast, large context (1M tokens), cost-effective' },
  { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro', provider: 'Google', description: 'Best quality from Google, large context' },
  { id: 'google/gemini-3-flash-lite', name: 'Gemini 3 Flash Lite', provider: 'Google', description: 'Fastest, most affordable' },
  // OpenAI (zero config on Vercel AI Gateway)
  { id: 'openai/gpt-5', name: 'GPT-5', provider: 'OpenAI', description: 'Most capable OpenAI model' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI', description: 'Fast and affordable OpenAI model' },
  { id: 'openai/o3', name: 'o3', provider: 'OpenAI', description: 'Advanced reasoning model' },
  { id: 'openai/o3-mini', name: 'o3 Mini', provider: 'OpenAI', description: 'Fast reasoning model' },
  { id: 'openai/o4-mini', name: 'o4 Mini', provider: 'OpenAI', description: 'Latest fast reasoning model' },
  // Anthropic (zero config on Vercel AI Gateway)
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Anthropic', description: 'Most capable Anthropic model' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', description: 'Balanced quality and speed' },
  // AWS Bedrock (zero config on Vercel AI Gateway)
  { id: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet v2 (Bedrock)', provider: 'AWS Bedrock', description: 'Best quality via Bedrock, data stays in AWS' },
  { id: 'bedrock/anthropic.claude-3-5-haiku-20241022-v1:0', name: 'Claude 3.5 Haiku (Bedrock)', provider: 'AWS Bedrock', description: 'Fast and affordable via Bedrock' },
  { id: 'bedrock/amazon.nova-pro-v1:0', name: 'Amazon Nova Pro', provider: 'AWS Bedrock', description: 'Amazon native model, best for AWS-native deployments' },
  { id: 'bedrock/amazon.nova-lite-v1:0', name: 'Amazon Nova Lite', provider: 'AWS Bedrock', description: 'Lightweight Amazon model, very fast' },
  { id: 'bedrock/meta.llama3-1-405b-instruct-v1:0', name: 'Llama 3.1 405B (Bedrock)', provider: 'AWS Bedrock', description: 'Open-source, runs within your AWS account' },
  { id: 'bedrock/meta.llama3-1-70b-instruct-v1:0', name: 'Llama 3.1 70B (Bedrock)', provider: 'AWS Bedrock', description: 'Open-source, balanced speed/quality' },
  { id: 'bedrock/mistral.mistral-large-2407-v1:0', name: 'Mistral Large (Bedrock)', provider: 'AWS Bedrock', description: 'Strong European-made model via Bedrock' },
  // Fireworks AI (zero config on Vercel AI Gateway)
  { id: 'fireworks/llama-v3p1-405b-instruct', name: 'Llama 3.1 405B', provider: 'Fireworks', description: 'Open-source, very capable' },
]

// We store the active model in a Supabase table so admins can switch it without redeploying
// Falls back to env var AI_MODEL, then to default

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Try to read from app_settings table
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'ai_model')
    .maybeSingle()

  const currentModel = setting?.value || process.env.AI_MODEL || 'google/gemini-3-flash'

  return NextResponse.json({
    currentModel,
    models: AVAILABLE_MODELS,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { model } = await request.json()
  if (!model || typeof model !== 'string' || model.trim().length === 0) {
    return NextResponse.json({ error: 'Model is required' }, { status: 400 })
  }

  const trimmed = model.trim()

  // Check if it's a known model or a custom one
  // Custom models must follow provider/model-name format
  const knownModel = AVAILABLE_MODELS.find(m => m.id === trimmed)
  const isValidFormat = /^[\w-]+\/[\w.:\-]+$/.test(trimmed)
  
  if (!knownModel && !isValidFormat) {
    return NextResponse.json({ error: 'Invalid model format. Use provider/model-name (e.g. bedrock/your-model-id)' }, { status: 400 })
  }

  // Upsert into app_settings
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'ai_model', value: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) {
    console.error('Error saving model setting:', error)
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
  }

  return NextResponse.json({ model: trimmed, name: knownModel?.name || trimmed, isCustom: !knownModel })
}
