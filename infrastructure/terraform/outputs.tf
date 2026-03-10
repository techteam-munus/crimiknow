# =============================================================================
# Terraform Outputs
# =============================================================================

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnet_ids
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------
output "db_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.db_endpoint
}

output "db_credentials_secret_name" {
  description = "Name of the Secrets Manager secret containing DB credentials"
  value       = module.rds.db_credentials_secret_name
}

# -----------------------------------------------------------------------------
# Authentication
# -----------------------------------------------------------------------------
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_client_id" {
  description = "Cognito Web Client ID"
  value       = module.cognito.web_client_id
}

output "cognito_domain" {
  description = "Cognito Hosted UI domain"
  value       = module.cognito.hosted_ui_url
}

# -----------------------------------------------------------------------------
# Email
# -----------------------------------------------------------------------------
output "ses_smtp_endpoint" {
  description = "SES SMTP endpoint"
  value       = module.ses.smtp_endpoint
}

output "ses_credentials_secret_name" {
  description = "Name of the Secrets Manager secret containing SES credentials"
  value       = module.ses.smtp_credentials_secret_name
}

# -----------------------------------------------------------------------------
# Application
# -----------------------------------------------------------------------------
output "amplify_app_url" {
  description = "Amplify default app URL"
  value       = module.amplify.production_url
}

output "amplify_custom_domain_url" {
  description = "Custom domain URL (if configured)"
  value       = module.amplify.custom_domain_url
}

output "amplify_webhook_url" {
  description = "Webhook URL for CI/CD triggers"
  value       = module.amplify.webhook_url
  sensitive   = true
}

# -----------------------------------------------------------------------------
# Security
# -----------------------------------------------------------------------------
output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN"
  value       = module.waf.web_acl_arn
}

# -----------------------------------------------------------------------------
# Connection Info (for manual setup/testing)
# -----------------------------------------------------------------------------
output "connection_info" {
  description = "Connection information for manual setup"
  value = {
    database = {
      host           = module.rds.db_address
      port           = module.rds.db_port
      name           = module.rds.db_name
      credentials    = "Stored in AWS Secrets Manager: ${module.rds.db_credentials_secret_name}"
    }
    auth = {
      user_pool_id = module.cognito.user_pool_id
      client_id    = module.cognito.web_client_id
      domain       = module.cognito.hosted_ui_url
    }
    email = {
      smtp_host = module.ses.smtp_endpoint
      smtp_port = 587
      credentials = "Stored in AWS Secrets Manager: ${module.ses.smtp_credentials_secret_name}"
    }
    app = {
      url = module.amplify.production_url
    }
  }
}
