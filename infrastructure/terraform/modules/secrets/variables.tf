variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

# Azure integration
variable "azure_search_endpoint" {
  description = "Azure AI Search endpoint"
  type        = string
  sensitive   = true
}

variable "azure_search_api_key" {
  description = "Azure AI Search API key"
  type        = string
  sensitive   = true
}

variable "azure_blob_urls" {
  description = "Map of Azure Blob URLs with SAS tokens"
  type        = map(string)
  sensitive   = true
}

# Payment gateways
variable "paypal_client_id" {
  description = "PayPal client ID"
  type        = string
  sensitive   = true
}

variable "paypal_client_secret" {
  description = "PayPal client secret"
  type        = string
  sensitive   = true
}

variable "paymongo_secret_key" {
  description = "PayMongo secret key"
  type        = string
  sensitive   = true
}

variable "paymongo_webhook_secret" {
  description = "PayMongo webhook secret"
  type        = string
  sensitive   = true
}

# Application secrets
variable "nextauth_secret" {
  description = "NextAuth secret (auto-generated if empty)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_secret" {
  description = "JWT secret (auto-generated if empty)"
  type        = string
  sensitive   = true
  default     = ""
}

# References to other module secrets
variable "db_credentials_secret_arn" {
  description = "ARN of DB credentials secret"
  type        = string
}

variable "ses_credentials_secret_arn" {
  description = "ARN of SES credentials secret"
  type        = string
}
