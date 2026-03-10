import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Fetch all maintenance settings
  const { data: settings } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['maintenance_enabled', 'maintenance_message', 'maintenance_start', 'maintenance_end'])

  const config: Record<string, string> = {}
  settings?.forEach(s => { config[s.key] = s.value })

  return NextResponse.json({
    enabled: config.maintenance_enabled === 'true',
    message: config.maintenance_message || '',
    startTime: config.maintenance_start || '',
    endTime: config.maintenance_end || '',
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

  const { enabled, message, startTime, endTime } = await request.json()

  const now = new Date().toISOString()
  const updates = [
    { key: 'maintenance_enabled', value: String(!!enabled), updated_at: now },
    { key: 'maintenance_message', value: message || '', updated_at: now },
    { key: 'maintenance_start', value: startTime || '', updated_at: now },
    { key: 'maintenance_end', value: endTime || '', updated_at: now },
  ]

  for (const update of updates) {
    const { error } = await supabase
      .from('app_settings')
      .upsert(update, { onConflict: 'key' })
    if (error) {
      console.error('Error saving maintenance setting:', error)
      return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
    }
  }

  return NextResponse.json({
    enabled: !!enabled,
    message: message || '',
    startTime: startTime || '',
    endTime: endTime || '',
  })
}
