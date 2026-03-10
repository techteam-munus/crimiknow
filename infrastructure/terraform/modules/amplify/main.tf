# =============================================================================
# AWS Amplify Module - Next.js Hosting
# =============================================================================

# -----------------------------------------------------------------------------
# Amplify App
# -----------------------------------------------------------------------------
resource "aws_amplify_app" "main" {
  name       = "${var.project_name}-${var.environment}"
  repository = var.github_repository

  # GitHub access token for private repos
  access_token = var.github_access_token

  # Build settings for Next.js 15
  build_spec = <<-EOT
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
EOT

  # Environment variables
  environment_variables = merge(
    {
      AMPLIFY_MONOREPO_APP_ROOT     = ""
      AMPLIFY_DIFF_DEPLOY           = "false"
      _LIVE_UPDATES                 = "[{\"pkg\":\"node\",\"type\":\"nvm\",\"version\":\"20\"}]"
      NEXT_PUBLIC_APP_URL           = var.domain_name != "" ? "https://${var.domain_name}" : ""
      NODE_ENV                      = "production"
    },
    var.environment_variables
  )

  # Custom rules for Next.js
  custom_rule {
    source = "/<*>"
    status = "404"
    target = "/404.html"
  }

  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>"
    status = "200"
    target = "/index.html"
  }

  # Enable auto branch creation
  enable_auto_branch_creation   = false
  enable_branch_auto_build      = true
  enable_branch_auto_deletion   = true

  # Platform settings
  platform = "WEB_COMPUTE" # Required for Next.js SSR

  tags = {
    Name = "${var.project_name}-${var.environment}"
  }
}

# -----------------------------------------------------------------------------
# Branch Configuration
# -----------------------------------------------------------------------------
resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.main.id
  branch_name = var.github_branch

  framework = "Next.js - SSR"
  stage     = var.environment == "prod" ? "PRODUCTION" : "DEVELOPMENT"

  enable_auto_build             = true
  enable_pull_request_preview   = var.environment != "prod"
  pull_request_environment_name = "pr"

  environment_variables = {
    NEXT_PUBLIC_ENV = var.environment
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-${var.github_branch}"
  }
}

# -----------------------------------------------------------------------------
# Custom Domain (optional)
# -----------------------------------------------------------------------------
resource "aws_amplify_domain_association" "main" {
  count = var.domain_name != "" ? 1 : 0

  app_id      = aws_amplify_app.main.id
  domain_name = var.domain_name

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = ""
  }

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "www"
  }

  wait_for_verification = false
}

# -----------------------------------------------------------------------------
# Webhook for CI/CD (alternative to GitHub App)
# -----------------------------------------------------------------------------
resource "aws_amplify_webhook" "main" {
  app_id      = aws_amplify_app.main.id
  branch_name = aws_amplify_branch.main.branch_name
  description = "Trigger deployment from GitHub"
}
