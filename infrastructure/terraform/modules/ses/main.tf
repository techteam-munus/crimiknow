# =============================================================================
# Amazon SES Module - Email Service
# =============================================================================

# -----------------------------------------------------------------------------
# Email Identity (Domain or Email Address)
# -----------------------------------------------------------------------------
resource "aws_ses_email_identity" "main" {
  count = var.email_address != "" ? 1 : 0
  email = var.email_address
}

resource "aws_ses_domain_identity" "main" {
  count  = var.domain_name != "" ? 1 : 0
  domain = var.domain_name
}

# -----------------------------------------------------------------------------
# Domain DKIM Configuration
# -----------------------------------------------------------------------------
resource "aws_ses_domain_dkim" "main" {
  count  = var.domain_name != "" ? 1 : 0
  domain = aws_ses_domain_identity.main[0].domain
}

# -----------------------------------------------------------------------------
# Domain Mail From (for better deliverability)
# -----------------------------------------------------------------------------
resource "aws_ses_domain_mail_from" "main" {
  count            = var.domain_name != "" ? 1 : 0
  domain           = aws_ses_domain_identity.main[0].domain
  mail_from_domain = "mail.${var.domain_name}"
}

# -----------------------------------------------------------------------------
# Configuration Set (for tracking)
# -----------------------------------------------------------------------------
resource "aws_ses_configuration_set" "main" {
  name = "${var.project_name}-${var.environment}"

  reputation_metrics_enabled = true
  sending_enabled            = true

  delivery_options {
    tls_policy = "REQUIRE"
  }
}

# -----------------------------------------------------------------------------
# Email Templates
# -----------------------------------------------------------------------------
resource "aws_ses_template" "otp" {
  name    = "${var.project_name}-${var.environment}-otp"
  subject = "Your CrimiKnow Verification Code"
  html    = <<-EOT
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .code { font-size: 32px; font-weight: bold; color: #166534; letter-spacing: 4px; padding: 20px; background: #f0fdf4; border-radius: 8px; text-align: center; }
    .footer { color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verify Your Email</h2>
    <p>Your verification code is:</p>
    <div class="code">{{otp}}</div>
    <p>This code expires in 10 minutes.</p>
    <p>If you didn't request this code, please ignore this email.</p>
    <div class="footer">
      <p>&copy; CrimiKnow - Philippine Criminal Law AI Library</p>
    </div>
  </div>
</body>
</html>
EOT
  text    = <<-EOT
Your CrimiKnow verification code is: {{otp}}

This code expires in 10 minutes.

If you didn't request this code, please ignore this email.

- CrimiKnow Team
EOT
}

resource "aws_ses_template" "welcome" {
  name    = "${var.project_name}-${var.environment}-welcome"
  subject = "Welcome to CrimiKnow!"
  html    = <<-EOT
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .btn { display: inline-block; padding: 12px 24px; background: #166534; color: white; text-decoration: none; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Welcome to CrimiKnow!</h2>
    <p>Hi {{name}},</p>
    <p>Thank you for joining CrimiKnow, your AI-powered Philippine Criminal Law library.</p>
    <p>You can now:</p>
    <ul>
      <li>Ask questions about criminal law</li>
      <li>Search jurisprudence and legal documents</li>
      <li>Get instant answers with citations</li>
    </ul>
    <p><a href="{{app_url}}/chat" class="btn">Start Exploring</a></p>
    <p>Best regards,<br>The CrimiKnow Team</p>
  </div>
</body>
</html>
EOT
  text    = <<-EOT
Welcome to CrimiKnow!

Hi {{name}},

Thank you for joining CrimiKnow, your AI-powered Philippine Criminal Law library.

Start exploring: {{app_url}}/chat

Best regards,
The CrimiKnow Team
EOT
}

# -----------------------------------------------------------------------------
# IAM User for SMTP Credentials (for app to send emails)
# -----------------------------------------------------------------------------
resource "aws_iam_user" "ses" {
  name = "${var.project_name}-${var.environment}-ses-smtp"
  path = "/system/"

  tags = {
    Name = "${var.project_name}-${var.environment}-ses-smtp"
  }
}

resource "aws_iam_access_key" "ses" {
  user = aws_iam_user.ses.name
}

resource "aws_iam_user_policy" "ses" {
  name = "${var.project_name}-${var.environment}-ses-send"
  user = aws_iam_user.ses.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress" = var.email_address != "" ? var.email_address : "*@${var.domain_name}"
          }
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Store SMTP credentials in Secrets Manager
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "ses_credentials" {
  name        = "${var.project_name}/${var.environment}/ses-credentials"
  description = "SES SMTP credentials for ${var.project_name}"

  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-ses-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "ses_credentials" {
  secret_id = aws_secretsmanager_secret.ses_credentials.id
  secret_string = jsonencode({
    smtp_host     = "email-smtp.${data.aws_region.current.name}.amazonaws.com"
    smtp_port     = 587
    smtp_username = aws_iam_access_key.ses.id
    smtp_password = aws_iam_access_key.ses.ses_smtp_password_v4
    from_email    = var.email_address != "" ? var.email_address : "noreply@${var.domain_name}"
  })
}

data "aws_region" "current" {}
