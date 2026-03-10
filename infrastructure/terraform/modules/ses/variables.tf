variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "email_address" {
  description = "Email address to verify (use for testing)"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Domain name to verify (recommended for production)"
  type        = string
  default     = ""
}
