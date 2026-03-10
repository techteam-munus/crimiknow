# =============================================================================
# Production Environment Configuration
# =============================================================================
# 
# Copy this file and fill in your actual values:
#   cp prod.tfvars prod.tfvars.local
#   # Edit prod.tfvars.local with your values
#   terraform apply -var-file="environments/prod.tfvars.local"
#
# NEVER commit files with real secrets to version control!
# =============================================================================

# General
project_name = "crimiknow"
environment  = "prod"
aws_region   = "ap-southeast-1" # Singapore (closest to Philippines)

# Networking
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["ap-southeast-1a", "ap-southeast-1b"]

# Database
db_instance_class        = "db.t3.medium"
db_allocated_storage     = 20
db_max_allocated_storage = 100
db_name                  = "crimiknow"
db_username              = "crimiknow_admin"
db_multi_az              = true
db_backup_retention_period = 7

# Application
# domain_name       = "crimiknow.com"  # Uncomment and set your domain
github_repository   = "https://github.com/YOUR_USERNAME/crimiknow"
github_branch       = "main"
github_access_token = "" # Generate at: GitHub > Settings > Developer settings > Personal access tokens

# Email
ses_email_identity = "noreply@crimiknow.com" # Or use your domain

# =============================================================================
# SENSITIVE VALUES - Store securely, never commit!
# =============================================================================
# You can either:
# 1. Set these via environment variables: TF_VAR_azure_search_endpoint=...
# 2. Create a separate .tfvars file that's gitignored
# 3. Use Terraform Cloud/Enterprise for secret management

# Azure Integration (Hybrid Cloud)
azure_search_endpoint = ""
azure_search_api_key  = ""
azure_blob_urls = {
  C1 = "" # Container 1 URL with SAS token
  C2 = "" # Container 2 URL with SAS token
  CB = "" # Bar exam container URL with SAS token
}

# Payment Gateways
paypal_client_id        = ""
paypal_client_secret    = ""
paymongo_secret_key     = ""
paymongo_webhook_secret = ""
