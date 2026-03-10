#!/bin/bash
# =============================================================================
# CrimiKnow User Migration Script
# Migrates users from Supabase Auth to AWS Cognito
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}User Migration: Supabase -> Cognito${NC}"
echo -e "${GREEN}======================================${NC}"

# Configuration
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID:-}"
SUPABASE_HOST="${SUPABASE_HOST:-}"
SUPABASE_PASSWORD="${SUPABASE_PASSWORD:-}"
SUPABASE_DB="${SUPABASE_DB:-postgres}"
SUPABASE_USER="${SUPABASE_USER:-postgres}"

# Validate inputs
if [ -z "$COGNITO_USER_POOL_ID" ]; then
    echo -e "${RED}Error: COGNITO_USER_POOL_ID not set${NC}"
    echo "Get it from Terraform output: terraform output cognito_user_pool_id"
    exit 1
fi

if [ -z "$SUPABASE_HOST" ] || [ -z "$SUPABASE_PASSWORD" ]; then
    echo -e "${RED}Error: Supabase credentials not set${NC}"
    echo "Set SUPABASE_HOST and SUPABASE_PASSWORD environment variables"
    exit 1
fi

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo -e "${GREEN}[1/4]${NC} Exporting users from Supabase..."

# Export users from Supabase
PGPASSWORD="$SUPABASE_PASSWORD" psql \
    -h "$SUPABASE_HOST" \
    -p 5432 \
    -U "$SUPABASE_USER" \
    -d "$SUPABASE_DB" \
    -t -A -F',' \
    -c "SELECT 
            au.email,
            COALESCE(p.full_name, '') as name,
            COALESCE(p.is_admin, false) as is_admin,
            au.created_at
        FROM auth.users au
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE au.email IS NOT NULL
        ORDER BY au.created_at" \
    > "$TEMP_DIR/users.csv"

USER_COUNT=$(wc -l < "$TEMP_DIR/users.csv")
echo -e "${GREEN}Found $USER_COUNT users to migrate${NC}"

if [ "$USER_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}No users to migrate.${NC}"
    exit 0
fi

echo -e "${GREEN}[2/4]${NC} Creating users in Cognito..."

# Process each user
MIGRATED=0
FAILED=0
SKIPPED=0

while IFS=',' read -r email name is_admin created_at; do
    # Skip empty lines
    [ -z "$email" ] && continue
    
    # Check if user already exists
    if aws cognito-idp admin-get-user \
        --user-pool-id "$COGNITO_USER_POOL_ID" \
        --username "$email" \
        --region "$AWS_REGION" &>/dev/null; then
        echo -e "${YELLOW}Skipped (exists):${NC} $email"
        ((SKIPPED++))
        continue
    fi
    
    # Create user in Cognito
    USER_ATTRIBUTES="Name=email,Value=$email Name=email_verified,Value=true"
    
    if [ -n "$name" ]; then
        USER_ATTRIBUTES="$USER_ATTRIBUTES Name=name,Value=$name"
    fi
    
    if [ "$is_admin" = "t" ] || [ "$is_admin" = "true" ]; then
        USER_ATTRIBUTES="$USER_ATTRIBUTES Name=custom:is_admin,Value=true"
    fi
    
    if aws cognito-idp admin-create-user \
        --user-pool-id "$COGNITO_USER_POOL_ID" \
        --username "$email" \
        --user-attributes $USER_ATTRIBUTES \
        --message-action "SUPPRESS" \
        --region "$AWS_REGION" &>/dev/null; then
        
        # Set user status to confirmed (skip email verification)
        aws cognito-idp admin-set-user-password \
            --user-pool-id "$COGNITO_USER_POOL_ID" \
            --username "$email" \
            --password "TempP@ss$(date +%s | sha256sum | head -c 8)" \
            --permanent \
            --region "$AWS_REGION" &>/dev/null
        
        echo -e "${GREEN}Migrated:${NC} $email"
        ((MIGRATED++))
    else
        echo -e "${RED}Failed:${NC} $email"
        ((FAILED++))
    fi
done < "$TEMP_DIR/users.csv"

echo -e "${GREEN}[3/4]${NC} Adding admins to admin group..."

# Add admins to admin group
while IFS=',' read -r email name is_admin created_at; do
    if [ "$is_admin" = "t" ] || [ "$is_admin" = "true" ]; then
        aws cognito-idp admin-add-user-to-group \
            --user-pool-id "$COGNITO_USER_POOL_ID" \
            --username "$email" \
            --group-name "admins" \
            --region "$AWS_REGION" &>/dev/null || true
        echo -e "${GREEN}Added to admins:${NC} $email"
    fi
done < "$TEMP_DIR/users.csv"

echo -e "${GREEN}[4/4]${NC} Migration complete!"

echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}Migration Summary${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "Total users:     $USER_COUNT"
echo -e "Migrated:        ${GREEN}$MIGRATED${NC}"
echo -e "Skipped:         ${YELLOW}$SKIPPED${NC}"
echo -e "Failed:          ${RED}$FAILED${NC}"

echo -e "\n${YELLOW}IMPORTANT:${NC}"
echo "- Migrated users have temporary passwords"
echo "- Users must use 'Forgot Password' to set their password"
echo "- Or use Cognito admin API to set passwords programmatically"
