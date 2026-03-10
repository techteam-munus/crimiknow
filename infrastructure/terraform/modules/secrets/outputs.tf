output "azure_secret_arn" {
  description = "ARN of the Azure integration secret"
  value       = aws_secretsmanager_secret.azure.arn
}

output "payments_secret_arn" {
  description = "ARN of the payment gateway secret"
  value       = aws_secretsmanager_secret.payments.arn
}

output "app_secret_arn" {
  description = "ARN of the application secrets"
  value       = aws_secretsmanager_secret.app.arn
}

output "read_secrets_policy_arn" {
  description = "ARN of the IAM policy for reading secrets"
  value       = aws_iam_policy.read_secrets.arn
}

output "all_secret_arns" {
  description = "List of all secret ARNs"
  value = [
    aws_secretsmanager_secret.azure.arn,
    aws_secretsmanager_secret.payments.arn,
    aws_secretsmanager_secret.app.arn
  ]
}
