# CrimiKnow AWS Deployment Guide

This guide covers deploying CrimiKnow to AWS using a secure, scalable architecture with RDS PostgreSQL, Cognito authentication, and Amplify hosting.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           AWS Cloud                                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    VPC (10.0.0.0/16)                          │  │
│  │                                                                │  │
│  │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │  │
│  │   │ Public AZ-a │   │ Public AZ-b │   │Private AZ-a │        │  │
│  │   │  NAT GW     │   │  NAT GW     │   │  RDS        │        │  │
│  │   └─────────────┘   └─────────────┘   │  Multi-AZ   │        │  │
│  │                                        └─────────────┘        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │  Amplify   │  │  Cognito   │  │    SES     │  │    WAF     │   │
│  │  Next.js   │  │   Auth     │  │   Email    │  │  Security  │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘   │
│                                                                      │
│  ┌────────────┐  ┌────────────┐                                    │
│  │  Secrets   │  │ CloudWatch │                                    │
│  │  Manager   │  │  Logging   │                                    │
│  └────────────┘  └────────────┘                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (Hybrid Cloud)
┌─────────────────────────────────────────────────────────────────────┐
│                        Azure (Existing)                              │
│  ┌────────────────────┐  ┌────────────────────┐                    │
│  │ Azure AI Search    │  │ Azure Blob Storage │                    │
│  │ (Knowledge Base)   │  │ (PDF Documents)    │                    │
│  └────────────────────┘  └────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Terraform** >= 1.5.0 installed
4. **GitHub repository** with your CrimiKnow code
5. **Domain name** (optional, for custom domain)

## Quick Start

### 1. Configure AWS CLI

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and region (ap-southeast-1)
```

### 2. Prepare Configuration

```bash
cd infrastructure/terraform

# Copy the template and fill in your values
cp environments/prod.tfvars environments/prod.tfvars.local

# Edit with your actual values
nano environments/prod.tfvars.local
```

Required values to set:
- `github_repository` - Your GitHub repo URL
- `github_access_token` - GitHub Personal Access Token
- `azure_search_endpoint` - Your Azure AI Search endpoint
- `azure_search_api_key` - Your Azure AI Search API key
- `azure_blob_urls` - Map of Azure Blob URLs with SAS tokens
- `paypal_*` and `paymongo_*` - Payment gateway credentials

### 3. Deploy Infrastructure

```bash
# Run the deployment script
chmod +x ../scripts/deploy-aws.sh
../scripts/deploy-aws.sh

# Or manually:
terraform init
terraform plan -var-file="environments/prod.tfvars.local"
terraform apply -var-file="environments/prod.tfvars.local"
```

### 4. Migrate Database

```bash
# Set Supabase credentials
export SUPABASE_HOST="your-project.supabase.co"
export SUPABASE_PASSWORD="your-db-password"

# Run migration
chmod +x ../scripts/migrate-db.sh
../scripts/migrate-db.sh
```

### 5. Migrate Users (Optional)

```bash
# Get Cognito User Pool ID from Terraform output
export COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)

# Run user migration
chmod +x ../scripts/migrate-users-to-cognito.sh
../scripts/migrate-users-to-cognito.sh
```

## Configuration Details

### Environment Variables

After deployment, Terraform automatically configures these environment variables in Amplify:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | RDS PostgreSQL connection string |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Cognito Web Client ID |
| `AWS_SECRETS_*` | Secrets Manager secret names |
| `AZURE_SEARCH_ENDPOINT` | Azure AI Search endpoint |

### Secrets Manager

Sensitive credentials are stored in AWS Secrets Manager:

- `crimiknow/prod/db-credentials` - Database credentials
- `crimiknow/prod/ses-credentials` - SMTP credentials
- `crimiknow/prod/azure-integration` - Azure API keys
- `crimiknow/prod/payment-gateway` - PayPal/PayMongo keys
- `crimiknow/prod/app-secrets` - JWT secrets

### DNS Configuration (Custom Domain)

If using a custom domain:

1. Add domain in Amplify console or via Terraform
2. Add the CNAME records shown in Amplify to your DNS
3. For SES, add DKIM records (shown in Terraform output)

## Security Features

- **VPC Isolation**: RDS in private subnets, no public access
- **Encryption**: All data encrypted at rest (KMS) and in transit (TLS)
- **WAF**: Protection against SQL injection, XSS, and rate limiting
- **Secrets Manager**: No hardcoded credentials
- **IAM**: Least privilege access policies
- **VPC Flow Logs**: Network traffic monitoring
- **CloudWatch**: Centralized logging and alerting

## Estimated Costs

| Service | Monthly Cost |
|---------|-------------|
| RDS PostgreSQL (db.t3.medium, Multi-AZ) | $50-70 |
| NAT Gateway | $30-45 |
| Amplify Hosting | $5-20 |
| Cognito | Free tier (50k MAU) |
| SES | ~$1 |
| WAF | $5-10 |
| Secrets Manager | ~$1 |
| CloudWatch | ~$5 |
| **Total** | **$100-150/mo** |

## Application Code Changes

After AWS deployment, you'll need to update the application to use AWS services instead of Supabase. Key changes:

1. **Database Client**: Replace Supabase client with direct PostgreSQL (pg)
2. **Authentication**: Replace Supabase Auth with Cognito SDK
3. **Email**: Update to use SES instead of SMTP
4. **Secrets**: Fetch from Secrets Manager at runtime

See `lib/aws/` for new AWS client implementations.

## Monitoring

### CloudWatch Dashboards

Access CloudWatch for:
- RDS performance metrics
- Application logs
- WAF blocked requests
- API latency and errors

### Alarms

Pre-configured alarms:
- RDS CPU > 80%
- RDS storage < 5GB
- RDS connections > 100

## Rollback

To rollback to previous infrastructure state:

```bash
# List state history
aws s3api list-object-versions --bucket crimiknow-terraform-state --prefix crimiknow/

# Restore specific version
terraform plan -var-file="environments/prod.tfvars.local"
# Review and apply if needed
```

## Troubleshooting

### Common Issues

1. **Terraform state lock error**
   ```bash
   terraform force-unlock <LOCK_ID>
   ```

2. **RDS connection timeout**
   - Check security groups
   - Verify NAT Gateway is working
   - Check RDS is in private subnet

3. **Cognito login issues**
   - Verify callback URLs match
   - Check user pool client settings

4. **SES emails not sending**
   - Verify email/domain identity
   - Check SES is out of sandbox mode (request production access)

### Getting Help

- Check CloudWatch Logs for application errors
- Review VPC Flow Logs for network issues
- Use AWS X-Ray for tracing (if enabled)

## Cleanup

To destroy all resources:

```bash
terraform destroy -var-file="environments/prod.tfvars.local"

# Also delete the state bucket and DynamoDB table if no longer needed
aws s3 rb s3://crimiknow-terraform-state --force
aws dynamodb delete-table --table-name crimiknow-terraform-locks
```
