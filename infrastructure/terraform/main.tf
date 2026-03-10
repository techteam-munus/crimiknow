# =============================================================================
# CrimiKnow AWS Infrastructure - Main Configuration
# =============================================================================
#
# This Terraform configuration provisions a secure, scalable AWS infrastructure
# for CrimiKnow with the following components:
#
# - VPC with public/private subnets across multiple AZs
# - RDS PostgreSQL database with encryption and Multi-AZ
# - Cognito for user authentication
# - Amplify for Next.js hosting with CI/CD
# - SES for transactional emails
# - WAF for web application firewall
# - Secrets Manager for secure credential storage
#
# Usage:
#   cd infrastructure/terraform
#   terraform init
#   terraform plan -var-file="environments/prod.tfvars"
#   terraform apply -var-file="environments/prod.tfvars"
#
# =============================================================================

# -----------------------------------------------------------------------------
# VPC Module
# -----------------------------------------------------------------------------
module "vpc" {
  source = "./modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  enable_nat_gateway = true
  single_nat_gateway = var.environment != "prod" # Use multiple NAT GWs in prod for HA
  enable_flow_logs   = true
}

# -----------------------------------------------------------------------------
# RDS PostgreSQL Module
# -----------------------------------------------------------------------------
module "rds" {
  source = "./modules/rds"

  project_name          = var.project_name
  environment           = var.environment
  private_subnet_ids    = module.vpc.private_subnet_ids
  security_group_id     = module.vpc.rds_security_group_id
  instance_class        = var.db_instance_class
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  db_name               = var.db_name
  db_username           = var.db_username
  multi_az              = var.db_multi_az
  backup_retention_period = var.db_backup_retention_period

  depends_on = [module.vpc]
}

# -----------------------------------------------------------------------------
# Cognito Module
# -----------------------------------------------------------------------------
module "cognito" {
  source = "./modules/cognito"

  project_name = var.project_name
  environment  = var.environment
  
  # SES integration for custom emails
  ses_email_arn = module.ses.email_identity_arn
  from_email    = var.ses_email_identity

  # OAuth callback URLs
  callback_urls = var.domain_name != "" ? [
    "https://${var.domain_name}/auth/callback",
    "https://www.${var.domain_name}/auth/callback",
    "http://localhost:3000/auth/callback"
  ] : ["http://localhost:3000/auth/callback"]

  logout_urls = var.domain_name != "" ? [
    "https://${var.domain_name}",
    "https://www.${var.domain_name}",
    "http://localhost:3000"
  ] : ["http://localhost:3000"]

  depends_on = [module.ses]
}

# -----------------------------------------------------------------------------
# SES Module
# -----------------------------------------------------------------------------
module "ses" {
  source = "./modules/ses"

  project_name  = var.project_name
  environment   = var.environment
  email_address = var.ses_email_identity
  domain_name   = var.domain_name
}

# -----------------------------------------------------------------------------
# Secrets Module
# -----------------------------------------------------------------------------
module "secrets" {
  source = "./modules/secrets"

  project_name = var.project_name
  environment  = var.environment

  # Azure integration (keeping existing Azure services)
  azure_search_endpoint = var.azure_search_endpoint
  azure_search_api_key  = var.azure_search_api_key
  azure_blob_urls       = var.azure_blob_urls

  # Payment gateways
  paypal_client_id        = var.paypal_client_id
  paypal_client_secret    = var.paypal_client_secret
  paymongo_secret_key     = var.paymongo_secret_key
  paymongo_webhook_secret = var.paymongo_webhook_secret

  # References to other secrets
  db_credentials_secret_arn  = module.rds.db_credentials_secret_arn
  ses_credentials_secret_arn = module.ses.smtp_credentials_secret_arn

  depends_on = [module.rds, module.ses]
}

# -----------------------------------------------------------------------------
# WAF Module (deployed in us-east-1 for CloudFront)
# -----------------------------------------------------------------------------
module "waf" {
  source = "./modules/waf"

  providers = {
    aws = aws.us_east_1
  }

  project_name      = var.project_name
  environment       = var.environment
  rate_limit        = 2000 # requests per 5 minutes per IP
  blocked_countries = []   # Add country codes to block if needed
}

# -----------------------------------------------------------------------------
# Amplify Module
# -----------------------------------------------------------------------------
module "amplify" {
  source = "./modules/amplify"

  project_name        = var.project_name
  environment         = var.environment
  github_repository   = var.github_repository
  github_branch       = var.github_branch
  github_access_token = var.github_access_token
  domain_name         = var.domain_name

  # Environment variables for the app
  environment_variables = {
    # Database
    DATABASE_URL = "postgresql://${var.db_username}:PLACEHOLDER@${module.rds.db_address}:${module.rds.db_port}/${var.db_name}?sslmode=require"
    
    # Cognito Auth
    NEXT_PUBLIC_COGNITO_USER_POOL_ID = module.cognito.user_pool_id
    NEXT_PUBLIC_COGNITO_CLIENT_ID    = module.cognito.web_client_id
    NEXT_PUBLIC_COGNITO_DOMAIN       = module.cognito.hosted_ui_url
    
    # AWS Region
    AWS_REGION = var.aws_region
    
    # Secrets (fetch at runtime)
    AWS_SECRETS_DB       = module.rds.db_credentials_secret_name
    AWS_SECRETS_SES      = module.ses.smtp_credentials_secret_name
    AWS_SECRETS_AZURE    = "${var.project_name}/${var.environment}/azure-integration"
    AWS_SECRETS_PAYMENTS = "${var.project_name}/${var.environment}/payment-gateway"
    AWS_SECRETS_APP      = "${var.project_name}/${var.environment}/app-secrets"
    
    # Azure (hybrid cloud - keep existing services)
    AZURE_SEARCH_ENDPOINT = var.azure_search_endpoint
    # API keys stored in Secrets Manager
  }

  depends_on = [module.vpc, module.rds, module.cognito, module.ses, module.secrets]
}
