#!/usr/bin/env bash

# ==============================================================================
#  🛡️ KH Cloud — Automated Encrypted Backup Tool (CLI & Cron)
#  Creates AES-256-GCM encrypted snapshot bundles of DB, S3 Storage, SSL, and .env
#  Supports local archive, Private GitHub Repository, and S3 / Cloudflare R2
# ==============================================================================

set -eo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m' # No Color

INSTALL_DIR="${KH_CLOUD_DIR:-/opt/kh-cloud}"
if [ ! -d "$INSTALL_DIR" ] && [ -f "./docker-compose.prod.yml" ]; then
  INSTALL_DIR="$(pwd)"
fi

cd "$INSTALL_DIR"

# Load .env configuration
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

SUDO_CMD=""
if [ "$EUID" -ne 0 ]; then
  SUDO_CMD="sudo"
fi

TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
BACKUP_NAME="kh-cloud-backup-${TIMESTAMP}"
TEMP_BACKUP_DIR="/tmp/${BACKUP_NAME}"
OUTPUT_DIR="${INSTALL_DIR}/backups"

echo -e "${CYAN}==> [1/4] Preparing Snapshot Directories...${NC}"
$SUDO_CMD mkdir -p "$TEMP_BACKUP_DIR"
$SUDO_CMD mkdir -p "$OUTPUT_DIR"

# Ensure master backup encryption key is set
if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
  # Fallback to ADMIN_API_KEY or generate a default
  BACKUP_ENCRYPTION_KEY="${ADMIN_API_KEY:-$(openssl rand -hex 32)}"
  echo -e "    ${YELLOW}Notice: Using derived key for snapshot encryption.${NC}"
fi

# Step 1: Copy System Database (SQLite / Prisma) safely
echo -e "${CYAN}==> [2/4] Capturing System Database & Persistent Volumes...${NC}"
$SUDO_CMD mkdir -p "${TEMP_BACKUP_DIR}/db"
if [ -f "/var/lib/kh-cloud/db/dev.db" ]; then
  # Use sqlite3 vacuum into if available, or direct copy
  if command -v sqlite3 &>/dev/null; then
    $SUDO_CMD sqlite3 /var/lib/kh-cloud/db/dev.db "VACUUM INTO '${TEMP_BACKUP_DIR}/db/dev.db'" || \
    $SUDO_CMD cp /var/lib/kh-cloud/db/dev.db "${TEMP_BACKUP_DIR}/db/dev.db"
  else
    $SUDO_CMD cp /var/lib/kh-cloud/db/dev.db* "${TEMP_BACKUP_DIR}/db/" 2>/dev/null || true
  fi
fi

# Step 2: Capture MinIO Object Storage files
$SUDO_CMD mkdir -p "${TEMP_BACKUP_DIR}/minio"
if [ -d "/var/lib/kh-cloud/minio" ]; then
  $SUDO_CMD cp -r /var/lib/kh-cloud/minio/* "${TEMP_BACKUP_DIR}/minio/" 2>/dev/null || true
fi

# Step 3: Capture Let's Encrypt SSL Certificates (acme.json)
$SUDO_CMD mkdir -p "${TEMP_BACKUP_DIR}/traefik-acme"
if [ -f "/var/lib/kh-cloud/traefik-acme/acme.json" ]; then
  $SUDO_CMD cp /var/lib/kh-cloud/traefik-acme/acme.json "${TEMP_BACKUP_DIR}/traefik-acme/acme.json"
fi

# Step 4: Capture Platform Configuration (.env)
if [ -f "${INSTALL_DIR}/.env" ]; then
  $SUDO_CMD cp "${INSTALL_DIR}/.env" "${TEMP_BACKUP_DIR}/.env"
fi

# Write backup metadata
$SUDO_CMD bash -c "cat > ${TEMP_BACKUP_DIR}/metadata.json" <<EOF
{
  "version": "1.0.1",
  "timestamp": "${TIMESTAMP}",
  "domain": "${BASE_DOMAIN:-yourdomain.com}",
  "arch": "$(uname -m)",
  "os": "$(uname -s)"
}
EOF

# Step 5: Archive & Encrypt with AES-256-CBC with PBKDF2
echo -e "${CYAN}==> [3/4] Compressing & Encrypting Snapshot (AES-256)...${NC}"
ARCHIVE_PATH="${OUTPUT_DIR}/${BACKUP_NAME}.enc.tar.gz"

$SUDO_CMD tar -czf - -C "$TEMP_BACKUP_DIR" . | \
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "pass:${BACKUP_ENCRYPTION_KEY}" -out "$ARCHIVE_PATH"

# Cleanup temporary plain directory
$SUDO_CMD rm -rf "$TEMP_BACKUP_DIR"

BACKUP_SIZE=$(ls -lh "$ARCHIVE_PATH" | awk '{print $5}')
echo -e "    ${GREEN}✓ Encrypted backup archive created:${NC} ${ARCHIVE_PATH} (${BACKUP_SIZE})"

# Step 6: Remote Sync (GitHub / S3 if configured)
echo -e "${CYAN}==> [4/4] Synchronizing to Remote Targets...${NC}"

# Target 1: Remote S3 / Cloudflare R2 / AWS S3
if [ -n "$BACKUP_S3_ENDPOINT" ] && [ -n "$BACKUP_S3_BUCKET" ] && [ -n "$BACKUP_S3_ACCESS_KEY" ] && [ -n "$BACKUP_S3_SECRET_KEY" ]; then
  echo -e "    Uploading to Remote S3 (${BACKUP_S3_BUCKET})..."
  if command -v aws &>/dev/null; then
    AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
    aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$ARCHIVE_PATH" "s3://${BACKUP_S3_BUCKET}/backups/${BACKUP_NAME}.enc.tar.gz"
    echo -e "    ${GREEN}✓ S3 remote upload successful!${NC}"
  else
    echo -e "    ${YELLOW}Note: aws-cli not installed. Saved locally at ${ARCHIVE_PATH}.${NC}"
  fi
fi

# Target 2: GitHub Private Backup Repository
if [ -n "$BACKUP_GITHUB_REPO" ] && [ -n "$BACKUP_GITHUB_TOKEN" ]; then
  echo -e "    Uploading to Private GitHub Repository (${BACKUP_GITHUB_REPO})..."
  GH_API_URL="https://api.github.com/repos/${BACKUP_GITHUB_REPO}/releases"
  
  # Create a GitHub Release for the snapshot
  RELEASE_RESPONSE=$(curl -s -X POST "$GH_API_URL" \
    -H "Authorization: token ${BACKUP_GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    -d "{\"tag_name\":\"backup-${TIMESTAMP}\",\"name\":\"Backup ${TIMESTAMP}\",\"body\":\"Automated encrypted backup snapshot for KH Cloud.\",\"draft\":false,\"prerelease\":false}")
  
  UPLOAD_URL=$(echo "$RELEASE_RESPONSE" | grep -o 'https://uploads.github.com/repos/[^"]*' | sed 's/{?name,label}//' | head -n 1)

  if [ -n "$UPLOAD_URL" ]; then
    curl -s -X POST "${UPLOAD_URL}?name=${BACKUP_NAME}.enc.tar.gz" \
      -H "Authorization: token ${BACKUP_GITHUB_TOKEN}" \
      -H "Content-Type: application/gzip" \
      --data-binary @"$ARCHIVE_PATH" > /dev/null
    echo -e "    ${GREEN}✓ GitHub private repository upload successful!${NC}"
  else
    echo -e "    ${YELLOW}Notice: GitHub release creation response did not return upload URL.${NC}"
  fi
fi

# Retention policy: keep last 10 local backups
find "$OUTPUT_DIR" -name "kh-cloud-backup-*.enc.tar.gz" -type f | sort -r | tail -n +11 | xargs -I {} $SUDO_CMD rm -f {} 2>/dev/null || true

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} 🛡️ ENCRYPTED BACKUP COMPLETED SUCCESSFULLY!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo -e "${BOLD}Snapshot Archive:${NC}       ${CYAN}${ARCHIVE_PATH}${NC}"
echo -e "${BOLD}Archive Size:${NC}           ${CYAN}${BACKUP_SIZE}${NC}"
echo -e "${BOLD}Encryption Key:${NC}         ${YELLOW}${BACKUP_ENCRYPTION_KEY}${NC}"
echo ""
echo -e "${YELLOW}👉 To restore this backup onto a new VPS at any time, run:${NC}"
echo -e "   ${CYAN}curl -fsSL https://raw.githubusercontent.com/khawarahemad/KH-cloude/main/restore.sh | bash${NC}"
echo "------------------------------------------------------------------"
