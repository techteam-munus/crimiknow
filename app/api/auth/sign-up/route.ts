import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Create admin client with service role key for auto-confirming users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json()

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Create user with admin client (auto-confirms email)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        full_name: fullName,
      },
    })

    if (error) {
      // Handle duplicate email error - check for various error formats
      const errorCode = (error as unknown as { code?: string })?.code
      const errorMessage = error.message || ''
      
      if (
        errorCode === 'email_exists' ||
        errorMessage.includes('already been registered') ||
        errorMessage.includes('email_exists') ||
        errorMessage.includes('already exists')
      ) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in instead.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. You can now sign in.',
      userId: data.user?.id,
      user: {
        id: data.user?.id,
        email: data.user?.email,
      },
    })
  } catch (error: any) {
    console.error('Sign-up error:', error)
    
    // Handle email_exists thrown as exception (Supabase fetch rejection)
    const errMsg = error?.message || error?.body || String(error)
    if (
      errMsg.includes('email_exists') ||
      errMsg.includes('already been registered') ||
      errMsg.includes('already exists')
    ) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
