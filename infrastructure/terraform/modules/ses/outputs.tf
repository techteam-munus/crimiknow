output "email_identity_arn" {
  description = "ARN of the email identity"
  value       = var.email_address != "" ? aws_ses_email_identity.main[0].arn : (var.domain_name != "" ? aws_ses_domain_identity.main[0].arn : null)
}

output "domain_dkim_tokens" {
  description = "DKIM tokens for DNS configuration"
  value       = var.domain_name != "" ? aws_ses_domain_dkim.main[0].dkim_tokens : []
}

output "configuration_set_name" {
  description = "Name of the SES configuration set"
  value       = aws_ses_configuration_set.main.name
}

output "smtp_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret containing SMTP credentials"
  value       = aws_secretsmanager_secret.ses_credentials.arn
}

output "smtp_credentials_secret_name" {
  description = "Name of the Secrets Manager secret containing SMTP credentials"
  value       = aws_secretsmanager_secret.ses_credentials.name
}

output "smtp_endpoint" {
  description = "SES SMTP endpoint"
  value       = "email-smtp.${data.aws_region.current.name}.amazonaws.com"
}
