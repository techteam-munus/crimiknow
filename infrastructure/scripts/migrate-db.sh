#!/bin/bash
# =============================================================================
# CrimiKnow Database Migration Script
# Migrates data from Supabase to AWS RDS PostgreSQL
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}CrimiKnow Database Migration${NC}"
echo -e "${GREEN}======================================${NC}"

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# Source: Supabase
SUPABASE_HOST="${SUPABASE_HOST:-}"
SUPABASE_PORT="${SUPABASE_PORT:-5432}"
SUPABASE_DB="${SUPABASE_DB:-postgres}"
SUPABASE_USER="${SUPABASE_USER:-postgres}"
SUPABASE_PASSWORD="${SUPABASE_PASSWORD:-}"

# Target: AWS RDS
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
RDS_SECRET_NAME="${RDS_SECRET_NAME:-crimiknow/prod/db-credentials}"

# Backup directory
BACKUP_DIR="./migration_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

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

check_command "pg_dump"
check_command "psql"
check_command "aws"
check_command "jq"

# Verify Supabase credentials
if [ -z "$SUPABASE_HOST" ] || [ -z "$SUPABASE_PASSWORD" ]; then
    log_error "Supabase credentials not set. Please set:"
    echo "  export SUPABASE_HOST=your-project.supabase.co"
    echo "  export SUPABASE_PASSWORD=your-password"
    exit 1
fi

# -----------------------------------------------------------------------------
# Get RDS Credentials from Secrets Manager
# -----------------------------------------------------------------------------

log_info "Fetching RDS credentials from AWS Secrets Manager..."

RDS_SECRET=$(aws secretsmanager get-secret-value \
    --secret-id "$RDS_SECRET_NAME" \
    --region "$AWS_REGION" \
    --query 'SecretString' \
    --output text 2>/dev/null)

if [ -z "$RDS_SECRET" ]; then
    log_error "Failed to fetch RDS credentials. Make sure:"
    echo "  1. AWS CLI is configured"
    echo "  2. You have permission to read the secret"
    echo "  3. The secret exists: $RDS_SECRET_NAME"
    exit 1
fi

RDS_HOST=$(echo "$RDS_SECRET" | jq -r '.host')
RDS_PORT=$(echo "$RDS_SECRET" | jq -r '.port')
RDS_DB=$(echo "$RDS_SECRET" | jq -r '.dbname')
RDS_USER=$(echo "$RDS_SECRET" | jq -r '.username')
RDS_PASSWORD=$(echo "$RDS_SECRET" | jq -r '.password')

log_info "RDS endpoint: $RDS_HOST:$RDS_PORT"

# -----------------------------------------------------------------------------
# Step 1: Export Schema from Supabase
# -----------------------------------------------------------------------------

log_info "Step 1: Exporting schema from Supabase..."

PGPASSWORD="$SUPABASE_PASSWORD" pg_dump \
    -h "$SUPABASE_HOST" \
    -p "$SUPABASE_PORT" \
    -U "$SUPABASE_USER" \
    -d "$SUPABASE_DB" \
    --schema-only \
    --no-owner \
    --no-privileges \
    --exclude-schema='auth' \
    --exclude-schema='storage' \
    --exclude-schema='realtime' \
    --exclude-schema='supabase_*' \
    --exclude-schema='_realtime' \
    --exclude-schema='extensions' \
    > "$BACKUP_DIR/schema.sql"

log_info "Schema exported to $BACKUP_DIR/schema.sql"

# -----------------------------------------------------------------------------
# Step 2: Export Data from Supabase
# -----------------------------------------------------------------------------

log_info "Step 2: Exporting data from Supabase..."

PGPASSWORD="$SUPABASE_PASSWORD" pg_dump \
    -h "$SUPABASE_HOST" \
    -p "$SUPABASE_PORT" \
    -U "$SUPABASE_USER" \
    -d "$SUPABASE_DB" \
    --data-only \
    --no-owner \
    --no-privileges \
    --exclude-schema='auth' \
    --exclude-schema='storage' \
    --exclude-schema='realtime' \
    --exclude-schema='supabase_*' \
    --exclude-schema='_realtime' \
    --exclude-schema='extensions' \
    > "$BACKUP_DIR/data.sql"

log_info "Data exported to $BACKUP_DIR/data.sql"

# -----------------------------------------------------------------------------
# Step 3: Transform Schema for RDS Compatibility
# -----------------------------------------------------------------------------

log_info "Step 3: Transforming schema for RDS compatibility..."

# Create a transformed schema file
cat > "$BACKUP_DIR/schema_transformed.sql" << 'EOF'
-- =============================================================================
-- CrimiKnow Database Schema for AWS RDS PostgreSQL
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

EOF

# Remove Supabase-specific elements and append
sed \
    -e '/^CREATE SCHEMA/d' \
    -e '/^SET /d' \
    -e '/^SELECT pg_catalog/d' \
    -e 's/public\.//' \
    -e 's/auth\.users/profiles/' \
    -e '/POLICY/d' \
    -e '/ENABLE ROW LEVEL SECURITY/d' \
    -e '/FORCE ROW LEVEL SECURITY/d' \
    "$BACKUP_DIR/schema.sql" >> "$BACKUP_DIR/schema_transformed.sql"

log_info "Transformed schema saved to $BACKUP_DIR/schema_transformed.sql"

# -----------------------------------------------------------------------------
# Step 4: Import Schema to RDS
# -----------------------------------------------------------------------------

log_info "Step 4: Importing schema to RDS..."

PGPASSWORD="$RDS_PASSWORD" psql \
    -h "$RDS_HOST" \
    -p "$RDS_PORT" \
    -U "$RDS_USER" \
    -d "$RDS_DB" \
    -f "$BACKUP_DIR/schema_transformed.sql" \
    2>&1 | tee "$BACKUP_DIR/schema_import.log"

log_info "Schema import complete. Check $BACKUP_DIR/schema_import.log for any errors."

# -----------------------------------------------------------------------------
# Step 5: Import Data to RDS
# -----------------------------------------------------------------------------

log_info "Step 5: Importing data to RDS..."

# Transform data file
sed \
    -e '/^SET /d' \
    -e 's/public\.//' \
    "$BACKUP_DIR/data.sql" > "$BACKUP_DIR/data_transformed.sql"

PGPASSWORD="$RDS_PASSWORD" psql \
    -h "$RDS_HOST" \
    -p "$RDS_PORT" \
    -U "$RDS_USER" \
    -d "$RDS_DB" \
    -f "$BACKUP_DIR/data_transformed.sql" \
    2>&1 | tee "$BACKUP_DIR/data_import.log"

log_info "Data import complete. Check $BACKUP_DIR/data_import.log for any errors."

# -----------------------------------------------------------------------------
# Step 6: Verify Migration
# -----------------------------------------------------------------------------

log_info "Step 6: Verifying migration..."

echo -e "\n${GREEN}Table row counts in RDS:${NC}"
PGPASSWORD="$RDS_PASSWORD" psql \
    -h "$RDS_HOST" \
    -p "$RDS_PORT" \
    -U "$RDS_USER" \
    -d "$RDS_DB" \
    -c "SELECT schemaname, relname, n_live_tup 
        FROM pg_stat_user_tables 
        ORDER BY n_live_tup DESC;"

# -----------------------------------------------------------------------------
# Step 7: Create Application User (optional)
# -----------------------------------------------------------------------------

log_info "Step 7: Creating application database user..."

PGPASSWORD="$RDS_PASSWORD" psql \
    -h "$RDS_HOST" \
    -p "$RDS_PORT" \
    -U "$RDS_USER" \
    -d "$RDS_DB" << 'EOSQL'
-- Create application user with limited privileges
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crimiknow_app') THEN
        CREATE USER crimiknow_app WITH PASSWORD 'CHANGE_ME_AFTER_CREATION';
    END IF;
END
$$;

-- Grant privileges
GRANT CONNECT ON DATABASE crimiknow TO crimiknow_app;
GRANT USAGE ON SCHEMA public TO crimiknow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crimiknow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crimiknow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crimiknow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO crimiknow_app;
EOSQL

# -----------------------------------------------------------------------------
# Complete
# -----------------------------------------------------------------------------

echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}Migration Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "\nBackup files saved to: ${YELLOW}$BACKUP_DIR${NC}"
echo -e "\nNext steps:"
echo "1. Review import logs for any errors"
echo "2. Update the application user password"
echo "3. Test application connectivity"
echo "4. Update app environment variables with new connection string"
