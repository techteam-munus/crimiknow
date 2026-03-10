import { createBrowserClient } from '@supabase/ssr'

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null
let hasHandledStaleToken = false

export function createClient() {
  // Reuse the same client instance to avoid creating multiple connections
  if (supabaseClient) {
    return supabaseClient
  }
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!url || !key) {
    console.warn('Supabase environment variables not configured')
  }
  
  supabaseClient = createBrowserClient(
    url || '',
    key || '',
  )

  // Listen for auth errors globally to catch stale refresh token loops
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && !session && !hasHandledStaleToken) {
      // Token refresh failed - stale session, sign out to break the loop
      hasHandledStaleToken = true
      supabaseClient?.auth.signOut().then(() => {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/')) {
          window.location.href = '/auth/login'
        }
      })
    }
    if (event === 'SIGNED_IN') {
      hasHandledStaleToken = false
    }
  })
  
  return supabaseClient
}
