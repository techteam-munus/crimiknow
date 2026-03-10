import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Create admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { userId, email, otp } = await request.json()

    if (!userId || !email || !otp) {
      return NextResponse.json(
        { error: 'User ID, email, and OTP are required' },
        { status: 400 }
      )
    }

    // Find the OTP record
    const { data: otpRecord, error: fetchError } = await supabaseAdmin
      .from('otp_codes')
      .select('*')
      .eq('user_id', userId)
      .eq('email', email)
      .eq('purpose', 'email_verification')
      .eq('is_verified', false)
      .single()

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        { error: 'No valid OTP found. Please request a new one.' },
        { status: 400 }
      )
    }

    // Check if OTP is expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'OTP has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    // Check max attempts
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      return NextResponse.json(
        { error: 'Maximum attempts exceeded. Please request a new OTP.' },
        { status: 400 }
      )
    }

    // Increment attempts
    await supabaseAdmin
      .from('otp_codes')
      .update({ attempts: otpRecord.attempts + 1 })
      .eq('id', otpRecord.id)

    // Verify OTP
    if (otpRecord.code !== otp) {
      const remainingAttempts = otpRecord.max_attempts - otpRecord.attempts - 1
      return NextResponse.json(
        { 
          error: `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.` 
        },
        { status: 400 }
      )
    }

    // Mark OTP as verified
    await supabaseAdmin
      .from('otp_codes')
      .update({ 
        is_verified: true,
        verified_at: new Date().toISOString()
      })
      .eq('id', otpRecord.id)

    // Update user's email_confirmed_at in auth.users
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Email verified successfully' 
    })
  } catch (error) {
    console.error('Error verifying OTP:', error)
    return NextResponse.json(
      { error: 'Failed to verify OTP' },
      { status: 500 }
    )
  }
}
