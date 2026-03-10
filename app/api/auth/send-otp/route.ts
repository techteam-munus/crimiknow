import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Create admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateOTP(): string {
  // Generate a 6-digit OTP
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Create nodemailer transporter
// Supports any SMTP provider: Gmail, Outlook, SendGrid, Mailgun, etc.
async function createTransporter() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    return null
  }

  const nodemailer = await import('nodemailer')

  return nodemailer.default.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: { user, pass },
  })
}

// Email template for OTP
function getOTPEmailHtml(otp: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your email - CrimiKnow</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f0fdf4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header with red accent -->
                <tr>
                  <td style="height: 4px; background-color: #ef4444; border-radius: 12px 12px 0 0;"></td>
                </tr>
                
                <!-- Logo and Title -->
                <tr>
                  <td style="padding: 32px 32px 24px 32px; text-align: center;">
                    <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px;">
                      <div style="width: 40px; height: 40px; background-color: #166534; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-weight: bold; font-size: 18px;">C</span>
                      </div>
                      <span style="font-size: 24px; font-weight: bold; color: #166534;">CrimiKnow</span>
                    </div>
                    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #1f2937;">Verify Your Email</h1>
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">Enter the code below to verify your email address</p>
                  </td>
                </tr>
                
                <!-- OTP Code -->
                <tr>
                  <td style="padding: 0 32px 32px 32px; text-align: center;">
                    <div style="background-color: #f9fafb; border: 2px dashed #d1d5db; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #166534;">${otp}</span>
                    </div>
                    <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
                      This code will expire in <strong>10 minutes</strong>.
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      If you didn't request this code, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px;">
                      CrimiKnow - Your AI-Powered Library for Philippine Criminal Law
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                      Powered by Ligala Law
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

export async function POST(request: Request) {
  try {
    const { userId, email } = await request.json()

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'User ID and email are required' },
        { status: 400 }
      )
    }

    // Generate OTP
    const otp = generateOTP()
    
    // Set expiry to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Delete any existing OTP for this user
    await supabaseAdmin
      .from('otp_codes')
      .delete()
      .eq('user_id', userId)
      .eq('purpose', 'email_verification')

    // Insert new OTP
    const { error: insertError } = await supabaseAdmin
      .from('otp_codes')
      .insert({
        user_id: userId,
        email,
        code: otp,
        purpose: 'email_verification',
        expires_at: expiresAt,
      })

    if (insertError) {
      console.error('Error inserting OTP:', insertError)
      return NextResponse.json(
        { error: 'Failed to generate OTP' },
        { status: 500 }
      )
    }

    // Attempt to send OTP email via nodemailer
    let emailSent = false
    let emailError: string | null = null

    const transporter = await createTransporter()

    if (transporter) {
      try {
        const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@crimiknow.com'
        
        await transporter.sendMail({
          from: `CrimiKnow <${fromAddress}>`,
          to: email,
          subject: `${otp} is your CrimiKnow verification code`,
          html: getOTPEmailHtml(otp),
        })

        emailSent = true
        console.log('OTP email sent successfully to:', email)
      } catch (err) {
        console.error('Error sending email via SMTP:', err)
        emailError = err instanceof Error ? err.message : 'Unknown email error'
      }
    } else {
      console.warn('SMTP not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASS) - email not sent')
      emailError = 'Email service not configured'
    }

    // Always log OTP to console for debugging/testing
    console.log(`[OTP] Verification code for ${email}: ${otp}`)
    
    return NextResponse.json({ 
      success: true, 
      message: emailSent 
        ? 'Verification code sent to your email' 
        : 'Verification code generated',
      emailSent,
      // Include OTP in response for testing when email is not configured
      // TODO: Remove testOtp from response before going to production
      ...(!emailSent && { testOtp: otp }),
      ...(emailError && { emailError })
    })
  } catch (error) {
    console.error('Error sending OTP:', error)
    return NextResponse.json(
      { error: 'Failed to send OTP' },
      { status: 500 }
    )
  }
}
