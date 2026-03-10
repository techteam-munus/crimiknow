# =============================================================================
# General Configuration
# =============================================================================

variable "project_name" {
  description = "Name of the project (used for resource naming)"
  type        = string
  default     = "crimiknow"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "ap-southeast-1" # Singapore (closest to Philippines)
}

# =============================================================================
# Networking
# =============================================================================

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["ap-southeast-1a", "ap-southeast-1b"]
}

# =============================================================================
# Database
# =============================================================================

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage in GB (for autoscaling)"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Name of the database"
  type        = string
  default     = "crimiknow"
}

variable "db_username" {
  description = "Master username for the database"
  type        = string
  default     = "crimiknow_admin"
  sensitive   = true
}

variable "db_backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = true
}

# =============================================================================
# Application
# =============================================================================

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "GitHub repository URL for Amplify"
  type        = string
  default     = ""
}

variable "github_branch" {
  description = "Git branch to deploy"
  type        = string
  default     = "main"
}

variable "github_access_token" {
  description = "GitHub personal access token for Amplify"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# Email (SES)
# =============================================================================

variable "ses_email_identity" {
  description = "Email address or domain to verify in SES"
  type        = string
  default     = ""
}

# =============================================================================
# Azure Integration (Hybrid Cloud)
# =============================================================================

variable "azure_search_endpoint" {
  description = "Azure AI Search endpoint URL"
  type        = string
  sensitive   = true
  default     = ""
}

variable "azure_search_api_key" {
  description = "Azure AI Search API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "azure_blob_urls" {
  description = "Map of Azure Blob storage URLs with SAS tokens"
  type        = map(string)
  sensitive   = true
  default     = {}
}

# =============================================================================
# Payment Integration
# =============================================================================

variable "paypal_client_id" {
  description = "PayPal client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paypal_client_secret" {
  description = "PayPal client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paymongo_secret_key" {
  description = "PayMongo secret key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paymongo_webhook_secret" {
  description = "PayMongo webhook secret"
  type        = string
  sensitive   = true
  default     = ""
}
