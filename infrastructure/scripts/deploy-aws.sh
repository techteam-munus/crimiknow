#!/bin/bash
# =============================================================================
# CrimiKnow AWS Deployment Script
# Provisions and deploys the complete AWS infrastructure
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/../terraform"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}CrimiKnow AWS Deployment${NC}"
echo -e "${BLUE}======================================${NC}"

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

ENVIRONMENT="${ENVIRONMENT:-prod}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is required but not installed."
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Pre-flight Checks
# -----------------------------------------------------------------------------

log_info "Running pre-flight checks..."

check_command "terraform"
check_command "aws"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    log_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
log_info "AWS Account: $AWS_ACCOUNT_ID"
log_info "AWS Region: $AWS_REGION"
log_info "Environment: $ENVIRONMENT"

# -----------------------------------------------------------------------------
# Step 1: Create Terraform State Backend
# -----------------------------------------------------------------------------

log_info "Step 1: Creating Terraform state backend..."

STATE_BUCKET="crimiknow-terraform-state"
LOCK_TABLE="crimiknow-terraform-locks"

# Create S3 bucket for state
if ! aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
    log_info "Creating S3 bucket for Terraform state..."
    aws s3api create-bucket \
        --bucket "$STATE_BUCKET" \
        --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION"
    
    aws s3api put-bucket-versioning \
        --bucket "$STATE_BUCKET" \
        --versioning-configuration Status=Enabled
    
    aws s3api put-bucket-encryption \
        --bucket "$STATE_BUCKET" \
        --server-side-encryption-configuration '{
            "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
        }'
    
    aws s3api put-public-access-block \
        --bucket "$STATE_BUCKET" \
        --public-access-block-configuration '{
            "BlockPublicAcls": true,
            "IgnorePublicAcls": true,
            "BlockPublicPolicy": true,
            "RestrictPublicBuckets": true
        }'
    
    log_info "S3 bucket created: $STATE_BUCKET"
else
    log_info "S3 bucket already exists: $STATE_BUCKET"
fi

# Create DynamoDB table for locking
if ! aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$AWS_REGION" 2>/dev/null; then
    log_info "Creating DynamoDB table for state locking..."
    aws dynamodb create-table \
        --table-name "$LOCK_TABLE" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --region "$AWS_REGION"
    
    log_info "DynamoDB table created: $LOCK_TABLE"
else
    log_info "DynamoDB table already exists: $LOCK_TABLE"
fi

# -----------------------------------------------------------------------------
# Step 2: Initialize Terraform
# -----------------------------------------------------------------------------

log_info "Step 2: Initializing Terraform..."

cd "$TERRAFORM_DIR"
terraform init -upgrade

# -----------------------------------------------------------------------------
# Step 3: Validate Configuration
# -----------------------------------------------------------------------------

log_info "Step 3: Validating Terraform configuration..."

terraform validate

# -----------------------------------------------------------------------------
# Step 4: Plan Deployment
# -----------------------------------------------------------------------------

log_info "Step 4: Planning deployment..."

TFVARS_FILE="environments/${ENVIRONMENT}.tfvars"

if [ ! -f "$TFVARS_FILE" ]; then
    log_error "Variable file not found: $TFVARS_FILE"
    log_info "Please copy and customize the template:"
    echo "  cp environments/prod.tfvars environments/${ENVIRONMENT}.tfvars.local"
    echo "  # Edit the file with your values"
    exit 1
fi

# Check for local override file
if [ -f "${TFVARS_FILE}.local" ]; then
    TFVARS_FILE="${TFVARS_FILE}.local"
    log_info "Using local override: $TFVARS_FILE"
fi

terraform plan \
    -var-file="$TFVARS_FILE" \
    -out="tfplan_${ENVIRONMENT}" \
    -detailed-exitcode || PLAN_EXIT=$?

case ${PLAN_EXIT:-0} in
    0)
        log_info "No changes required."
        exit 0
        ;;
    1)
        log_error "Terraform plan failed."
        exit 1
        ;;
    2)
        log_info "Changes detected. Review the plan above."
        ;;
esac

# -----------------------------------------------------------------------------
# Step 5: Apply Changes (with confirmation)
# -----------------------------------------------------------------------------

echo ""
read -p "Do you want to apply these changes? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log_warn "Deployment cancelled."
    rm -f "tfplan_${ENVIRONMENT}"
    exit 0
fi

log_info "Step 5: Applying changes..."

terraform apply "tfplan_${ENVIRONMENT}"

rm -f "tfplan_${ENVIRONMENT}"

# -----------------------------------------------------------------------------
# Step 6: Output Connection Info
# -----------------------------------------------------------------------------

log_info "Step 6: Deployment complete! Here's your connection info:"

terraform output connection_info

echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "\nNext steps:"
echo "1. Verify SES email identity (check your email)"
echo "2. Run database migration: ./migrate-db.sh"
echo "3. Configure DNS if using custom domain"
echo "4. Test the application"
