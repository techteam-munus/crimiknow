output "app_id" {
  description = "ID of the Amplify app"
  value       = aws_amplify_app.main.id
}

output "app_arn" {
  description = "ARN of the Amplify app"
  value       = aws_amplify_app.main.arn
}

output "default_domain" {
  description = "Default domain of the Amplify app"
  value       = aws_amplify_app.main.default_domain
}

output "branch_name" {
  description = "Name of the deployed branch"
  value       = aws_amplify_branch.main.branch_name
}

output "production_url" {
  description = "Production URL of the app"
  value       = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.main.default_domain}"
}

output "custom_domain_url" {
  description = "Custom domain URL (if configured)"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : null
}

output "webhook_url" {
  description = "Webhook URL for triggering deployments"
  value       = aws_amplify_webhook.main.url
  sensitive   = true
}
