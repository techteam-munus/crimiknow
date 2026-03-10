# =============================================================================
# AWS Secrets Manager Module - Application Secrets
# =============================================================================

# -----------------------------------------------------------------------------
# Azure Integration Secrets (Hybrid Cloud)
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "azure" {
  name        = "${var.project_name}/${var.environment}/azure-integration"
  description = "Azure AI Search and Blob Storage credentials"

  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-azure-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "azure" {
  secret_id = aws_secretsmanager_secret.azure.id
  secret_string = jsonencode({
    search_endpoint = var.azure_search_endpoint
    search_api_key  = var.azure_search_api_key
    blob_url_c1     = var.azure_blob_urls["C1"]
    blob_url_c2     = var.azure_blob_urls["C2"]
    blob_url_cb     = var.azure_blob_urls["CB"]
  })
}

# -----------------------------------------------------------------------------
# Payment Gateway Secrets
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "payments" {
  name        = "${var.project_name}/${var.environment}/payment-gateway"
  description = "PayPal and PayMongo credentials"

  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-payment-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "payments" {
  secret_id = aws_secretsmanager_secret.payments.id
  secret_string = jsonencode({
    paypal_client_id        = var.paypal_client_id
    paypal_client_secret    = var.paypal_client_secret
    paymongo_secret_key     = var.paymongo_secret_key
    paymongo_webhook_secret = var.paymongo_webhook_secret
  })
}

# -----------------------------------------------------------------------------
# Application Secrets
# -----------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "app" {
  name        = "${var.project_name}/${var.environment}/app-secrets"
  description = "Application-level secrets"

  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-app-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    nextauth_secret = var.nextauth_secret != "" ? var.nextauth_secret : random_password.nextauth.result
    jwt_secret      = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt.result
  })
}

resource "random_password" "nextauth" {
  length  = 64
  special = true
}

resource "random_password" "jwt" {
  length  = 64
  special = true
}

# -----------------------------------------------------------------------------
# IAM Policy for reading secrets
# -----------------------------------------------------------------------------
resource "aws_iam_policy" "read_secrets" {
  name        = "${var.project_name}-${var.environment}-read-secrets"
  description = "Allow reading application secrets from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.azure.arn,
          aws_secretsmanager_secret.payments.arn,
          aws_secretsmanager_secret.app.arn,
          var.db_credentials_secret_arn,
          var.ses_credentials_secret_arn
        ]
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-read-secrets"
  }
}
