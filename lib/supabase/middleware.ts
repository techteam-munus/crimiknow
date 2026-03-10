import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Public routes that don't require authentication - check FIRST before any Supabase calls
  const publicRoutes = ['/', '/auth/login', '/auth/sign-in', '/auth/sign-up', '/auth/sign-up-success', '/auth/error', '/api/auth', '/documents', '/api/documents', '/api/documents/debug']
  const isPublicRoute = publicRoutes.some(route => pathname === route || (route !== '/' && pathname.startsWith(route)))
  
  // For completely public routes, skip Supabase entirely to avoid network errors
  if (isPublicRoute) {
    return NextResponse.next({ request })
  }
  
  // If Supabase env vars are not set, allow through without auth checks
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request })
  }
  
  // Semi-protected routes (require auth but shouldn't redirect away)
  const semiProtectedRoutes = ['/auth/verify-otp', '/payment']
  const isSemiProtectedRoute = semiProtectedRoutes.some(route => pathname.startsWith(route))
  
  // Protected routes that require authentication
  const protectedRoutes = ['/chat', '/account', '/subscription']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )
  
  // Try to get the user, but handle network/auth errors gracefully
  let user = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      // Invalid/stale session -- clear auth cookies to stop infinite retry loop
      const isStaleSession =
        error.message?.includes('Refresh Token') ||
        error.message?.includes('session_not_found') ||
        error.status === 400 ||
        error.status === 403
      
      if (isStaleSession) {
        await supabase.auth.signOut().catch(() => {})
        // Clear all supabase auth cookies
        const cookieNames = request.cookies.getAll().map(c => c.name)
        for (const name of cookieNames) {
          if (name.includes('auth-token') || name.includes('supabase')) {
            supabaseResponse.cookies.delete(name)
          }
        }
        if (isProtectedRoute || pathname.startsWith('/admin')) {
          const url = request.nextUrl.clone()
          url.pathname = '/auth/login'
          return NextResponse.redirect(url)
        }
        return supabaseResponse
      }
    }
    user = data.user
  } catch {
    // Network error connecting to Supabase - redirect to error page for protected routes
    if (isProtectedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('error', 'connection')
      return NextResponse.redirect(url)
    }
    // For semi-protected routes, allow through but without user
    return supabaseResponse
  }
  
  // If user is not logged in and trying to access protected routes
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }
  
  // If user is logged in and trying to access login/sign-up pages (but not verify-otp or payment)
  // Only redirect if there's no plan parameter (user is not in the middle of a purchase flow)
  const hasPlanParam = request.nextUrl.searchParams.has('plan')
  if (user && !isSemiProtectedRoute && (pathname === '/auth/login' || pathname === '/auth/sign-up') && !hasPlanParam) {
    const url = request.nextUrl.clone()
    url.pathname = '/chat'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
