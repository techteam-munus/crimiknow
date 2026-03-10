variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "ses_email_arn" {
  description = "ARN of verified SES email identity (optional)"
  type        = string
  default     = ""
}

variable "from_email" {
  description = "From email address for Cognito emails"
  type        = string
  default     = ""
}

variable "callback_urls" {
  description = "OAuth callback URLs"
  type        = list(string)
  default     = ["http://localhost:3000/auth/callback"]
}

variable "logout_urls" {
  description = "OAuth logout URLs"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "enable_custom_auth" {
  description = "Enable custom authentication flow with Lambda triggers"
  type        = bool
  default     = false
}

variable "lambda_define_auth_challenge_arn" {
  description = "ARN of Lambda for DefineAuthChallenge trigger"
  type        = string
  default     = ""
}

variable "lambda_create_auth_challenge_arn" {
  description = "ARN of Lambda for CreateAuthChallenge trigger"
  type        = string
  default     = ""
}

variable "lambda_verify_auth_challenge_arn" {
  description = "ARN of Lambda for VerifyAuthChallengeResponse trigger"
  type        = string
  default     = ""
}

variable "lambda_pre_sign_up_arn" {
  description = "ARN of Lambda for PreSignUp trigger"
  type        = string
  default     = ""
}

variable "lambda_post_confirmation_arn" {
  description = "ARN of Lambda for PostConfirmation trigger"
  type        = string
  default     = ""
}
