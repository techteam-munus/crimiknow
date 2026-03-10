import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_SYSTEM_PROMPT = `You are CrimiKnow, an AI-powered criminal law library for Philippine criminal law. Provide comprehensive, detailed answers with legal citations referencing the Revised Penal Code, special penal laws, and relevant jurisprudence.`

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Read from app_settings table (maybeSingle to handle 0 rows)
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'system_prompt')
    .maybeSingle()

  const prompt = setting?.value || process.env.AZURE_AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT

  return NextResponse.json({ prompt, isDefault: !setting?.value })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { prompt } = await request.json()
  if (typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Prompt must be a string' }, { status: 400 })
  }

  const trimmed = prompt.trim()
  if (trimmed.length === 0) {
    // Delete the custom prompt to revert to default
    await supabase
      .from('app_settings')
      .delete()
      .eq('key', 'system_prompt')

    return NextResponse.json({ prompt: DEFAULT_SYSTEM_PROMPT, isDefault: true })
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: 'system_prompt', value: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) {
    console.error('Error saving system prompt:', error)
    return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 })
  }

  return NextResponse.json({ prompt: trimmed, isDefault: false })
}
