import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Public endpoint: returns maintenance status for any authenticated user
export async function GET() {
  const supabase = await createClient()

  const { data: settings } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['maintenance_enabled', 'maintenance_message', 'maintenance_start', 'maintenance_end'])

  const config: Record<string, string> = {}
  settings?.forEach(s => { config[s.key] = s.value })

  const enabled = config.maintenance_enabled === 'true'
  const startTime = config.maintenance_start || ''
  const endTime = config.maintenance_end || ''
  const message = config.maintenance_message || ''

  // Check if maintenance is currently active (enabled AND within time window if set)
  let isActive = false
  if (enabled) {
    const now = Date.now()
    const hasStart = startTime.length > 0
    const hasEnd = endTime.length > 0
    const startMs = hasStart ? new Date(startTime).getTime() : 0
    const endMs = hasEnd ? new Date(endTime).getTime() : Infinity

    if (!hasStart && !hasEnd) {
      // No time window -- immediately active
      isActive = true
    } else if (now >= startMs && now <= endMs) {
      isActive = true
    }
  }

  // Check if maintenance is scheduled (enabled, has a future start time, not yet active)
  let isScheduled = false
  if (enabled && !isActive && startTime.length > 0) {
    const now = Date.now()
    const startMs = new Date(startTime).getTime()
    if (startMs > now) {
      isScheduled = true
    }
  }

  return NextResponse.json({
    enabled,
    isActive,
    isScheduled,
    message,
    startTime,
    endTime,
  })
}
