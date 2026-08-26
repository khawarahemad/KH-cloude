#!/usr/bin/env bash

# ==============================================================================
#  🚑 KH Cloud — 1-Command Disaster Recovery & Restore Wizard
#  Restores an entire KH Cloud server from an encrypted GitHub / S3 / Local backup
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
REPO_URL="https://github.com/khawarahemad/KH-cloude.git"

print_banner() {
  echo -e "${CYAN}"
  echo "██████╗ ███████╗███████╗████████╗ ██████╗ ██████╗ ███████╗"
  echo "██╔══██╗██╔════╝██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗██╔════╝"
  echo "██████╔╝█████╗  ███████╗   ██║   ██║   ██║██████╔╝█████╗  "
  echo "██╔══██╗██╔══╝  ╚════██║   ██║   ██║   ██║██╔══██╗██╔══╝  "
  echo "██║  ██║███████╗███████║   ██║   ╚██████╔╝██║  ██║███████╗"
  echo "╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝"
  echo -e "${NC}"
  echo -e "${BOLD}1-Command Disaster Recovery & Snapshot Restore Wizard${NC}"
  echo -e "${DIM}Restores complete databases, S3 storage, SSL, and configurations onto any VPS${NC}"
  echo "------------------------------------------------------------------"
  echo ""
}

print_banner

SUDO_CMD=""
if [ "$EUID" -ne 0 ]; then
  if ! command -v sudo &> /dev/null; then
    echo -e "${RED}Error: Please run this script as root or install sudo.${NC}"
    exit 1
  fi
  SUDO_CMD="sudo"
fi

# Attach terminal for interactive inputs when piped via curl | bash
if [ -c /dev/tty ]; then
  exec < /dev/tty
fi

# Step 1: Ensure Docker Engine is installed
echo -e "${CYAN}==> [1/6] Checking Docker Engine & Environment...${NC}"
if ! command -v docker &> /dev/null; then
  echo -e "    ${YELLOW}Docker not found. Installing Docker Engine...${NC}"
  if command -v apt-get &> /dev/null; then
    $SUDO_CMD apt-get update -y
    $SUDO_CMD apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release git tar openssl
    $SUDO_CMD mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO_CMD gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | $SUDO_CMD tee /etc/apt/sources.list.d/docker.list > /dev/null
    $SUDO_CMD apt-get update -y
    $SUDO_CMD apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin
  else
    curl -fsSL https://get.docker.com | $SUDO_CMD sh
  fi
  echo -e "    ${GREEN}✓ Docker Engine installed!${NC}"
else
  echo -e "    ${GREEN}✓ Docker Engine detected: $(docker --version)${NC}"
fi

# Step 2: Choose Backup Source
echo ""
echo -e "${CYAN}==> [2/6] Select Backup Source Destination:${NC}"
echo "   1) 🐙 Private GitHub Backup Repository"
echo "   2) ☁️ Remote S3 / Cloudflare R2 / AWS S3"
echo "   3) 📁 Local Encrypted Backup File (.enc.tar.gz)"
echo "   4) 🌐 Direct Download URL"
echo ""

read -r -p "Enter selection [1-4]: " BACKUP_SOURCE_CHOICE
TEMP_RESTORE_DIR="/tmp/kh-cloud-restore-$(date +%s)"
$SUDO_CMD mkdir -p "$TEMP_RESTORE_DIR"
DOWNLOADED_ARCHIVE="${TEMP_RESTORE_DIR}/backup.enc.tar.gz"

case "$BACKUP_SOURCE_CHOICE" in
  1)
    echo ""
    echo -e "${BOLD}GitHub Private Backup Repository Configuration${NC}"
    read -r -p "   GitHub Repository (e.g. username/my-backups): " GH_REPO
    read -r -p "   GitHub Personal Access Token (PAT): " GH_TOKEN

    echo -e "    Fetching latest backup release from GitHub..."
    RELEASES_JSON=$(curl -s -H "Authorization: token ${GH_TOKEN}" "https://api.github.com/repos/${GH_REPO}/releases")
    ASSET_URL=$(echo "$RELEASES_JSON" | grep -o 'https://api.github.com/repos/[^"]*/assets/[0-9]*' | head -n 1)

    if [ -z "$ASSET_URL" ]; then
      echo -e "${RED}Error: Could not find any backup release assets in repository ${GH_REPO}.${NC}"
      exit 1
    fi

    echo -e "    Downloading encrypted backup asset..."
    curl -s -L -H "Authorization: token ${GH_TOKEN}" -H "Accept: application/octet-stream" "$ASSET_URL" -o "$DOWNLOADED_ARCHIVE"
    ;;

  2)
    echo ""
    echo -e "${BOLD}Remote S3 / Cloudflare R2 Configuration${NC}"
    read -r -p "   S3 Endpoint (e.g. https://<account_id>.r2.cloudflarestorage.com): " S3_ENDPOINT
    read -r -p "   S3 Bucket Name: " S3_BUCKET
    read -r -p "   S3 Access Key: " S3_KEY
    read -r -p "   S3 Secret Key: " S3_SECRET
    read -r -p "   Snapshot File Key [latest or backups/kh-cloud-backup-*.enc.tar.gz]: " S3_KEY_PATH

    if command -v aws &>/dev/null; then
      AWS_ACCESS_KEY_ID="$S3_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET" \
      aws --endpoint-url "$S3_ENDPOINT" s3 cp "s3://${S3_BUCKET}/${S3_KEY_PATH}" "$DOWNLOADED_ARCHIVE"
    else
      echo -e "${RED}Error: aws-cli is required for direct S3 downloads. Please download the file or use GitHub/Direct URL.${NC}"
      exit 1
    fi
    ;;

  3)
    echo ""
    read -r -p "Enter absolute path to .enc.tar.gz backup file: " LOCAL_PATH
    if [ ! -f "$LOCAL_PATH" ]; then
      echo -e "${RED}Error: File not found at ${LOCAL_PATH}.${NC}"
      exit 1
    fi
    $SUDO_CMD cp "$LOCAL_PATH" "$DOWNLOADED_ARCHIVE"
    ;;

  4)
    echo ""
    read -r -p "Enter direct download URL for backup archive: " DIRECT_URL
    echo -e "    Downloading backup archive from URL..."
    curl -fsSL "$DIRECT_URL" -o "$DOWNLOADED_ARCHIVE"
    ;;

  *)
    echo -e "${RED}Invalid selection. Exiting.${NC}"
    exit 1
    ;;
esac

if [ ! -f "$DOWNLOADED_ARCHIVE" ] || [ ! -s "$DOWNLOADED_ARCHIVE" ]; then
  echo -e "${RED}Error: Failed to obtain valid encrypted backup archive.${NC}"
  exit 1
fi

# Step 3: Decrypt Archive
echo ""
echo -e "${CYAN}==> [3/6] Decrypting Backup Snapshot...${NC}"
read -r -s -p "Enter Master Backup Encryption Key: " USER_KEY
echo ""

UNPACKED_DIR="${TEMP_RESTORE_DIR}/unpacked"
$SUDO_CMD mkdir -p "$UNPACKED_DIR"

if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass "pass:${USER_KEY}" -in "$DOWNLOADED_ARCHIVE" | $SUDO_CMD tar -xzf - -C "$UNPACKED_DIR"; then
  echo -e "${RED}❌ Decryption failed! The encryption key provided is incorrect or the archive is corrupted.${NC}"
  $SUDO_CMD rm -rf "$TEMP_RESTORE_DIR"
  exit 1
fi

echo -e "    ${GREEN}✓ Decryption and archive decompression successful!${NC}"

# Step 4: Clone / Update KH Cloud Source Code
echo -e "${CYAN}==> [4/6] Setting Up Project Workspace at ${INSTALL_DIR}...${NC}"
$SUDO_CMD mkdir -p "$INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR"
  $SUDO_CMD git fetch --all
  $SUDO_CMD git reset --hard origin/main
else
  $SUDO_CMD git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Step 5: Restore Volumes and Database Data
echo -e "${CYAN}==> [5/6] Restoring Persistent Volumes, Databases & SSL Certificates...${NC}"
$SUDO_CMD mkdir -p /var/lib/kh-cloud/traefik-acme
$SUDO_CMD mkdir -p /var/lib/kh-cloud/redis
$SUDO_CMD mkdir -p /var/lib/kh-cloud/minio
$SUDO_CMD mkdir -p /var/lib/kh-cloud/db
$SUDO_CMD mkdir -p /var/lib/kh-cloud/storage-mock
$SUDO_CMD mkdir -p /var/log/kh-cloud

# Restore Database
if [ -d "${UNPACKED_DIR}/db" ]; then
  $SUDO_CMD cp -r "${UNPACKED_DIR}/db/"* /var/lib/kh-cloud/db/ 2>/dev/null || true
  echo -e "    ${GREEN}✓ System SQLite Database restored.${NC}"
fi

# Restore MinIO Object Storage
if [ -d "${UNPACKED_DIR}/minio" ]; then
  $SUDO_CMD cp -r "${UNPACKED_DIR}/minio/"* /var/lib/kh-cloud/minio/ 2>/dev/null || true
  echo -e "    ${GREEN}✓ MinIO Object Storage files restored.${NC}"
fi

# Restore ACME SSL Certs
if [ -f "${UNPACKED_DIR}/traefik-acme/acme.json" ]; then
  $SUDO_CMD cp "${UNPACKED_DIR}/traefik-acme/acme.json" /var/lib/kh-cloud/traefik-acme/acme.json
  $SUDO_CMD chmod 600 /var/lib/kh-cloud/traefik-acme/acme.json
  echo -e "    ${GREEN}✓ Let's Encrypt TLS/SSL certificates restored.${NC}"
else
  $SUDO_CMD touch /var/lib/kh-cloud/traefik-acme/acme.json
  $SUDO_CMD chmod 600 /var/lib/kh-cloud/traefik-acme/acme.json
fi

# Restore .env
if [ -f "${UNPACKED_DIR}/.env" ]; then
  $SUDO_CMD cp "${UNPACKED_DIR}/.env" "${INSTALL_DIR}/.env"
  $SUDO_CMD chmod 600 "${INSTALL_DIR}/.env"
  echo -e "    ${GREEN}✓ Platform environment secrets restored.${NC}"
fi

$SUDO_CMD chmod -R 777 /var/lib/kh-cloud/
if [ -f /var/lib/kh-cloud/traefik-acme/acme.json ]; then
  $SUDO_CMD chmod 600 /var/lib/kh-cloud/traefik-acme/acme.json
fi

# Clean up temp restore files
$SUDO_CMD rm -rf "$TEMP_RESTORE_DIR"

# Step 6: Launch Docker Cluster
echo -e "${CYAN}==> [6/6] Launching Restored KH Cloud Cluster...${NC}"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

$SUDO_CMD docker compose -f docker-compose.prod.yml pull || true
$SUDO_CMD docker compose -f docker-compose.prod.yml up -d --build

echo "    Waiting for services to warm up..."
sleep 6

# Synchronize database schema inside backend
$SUDO_CMD docker compose -f docker-compose.prod.yml exec -T backend npx prisma db push --accept-data-loss

# Load active config
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

DETECTED_DOMAIN="${BASE_DOMAIN:-yourdomain.com}"
SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "YOUR_NEW_VPS_IP")

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} 🎉 DISASTER RECOVERY & RESTORE COMPLETED SUCCESSFULLY!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo -e "${BOLD}New Server IP:${NC}          ${CYAN}${SERVER_IP}${NC}"
echo -e "${BOLD}Restored Root Domain:${NC}   ${CYAN}${DETECTED_DOMAIN}${NC}"
echo ""
echo -e "${YELLOW}👉 Make sure your DNS A-Records point to this new VPS IP (${SERVER_IP}):${NC}"
echo "   • Type A:  @ (Apex)     ->  ${SERVER_IP}  (DNS Only)"
echo "   • Type A:  * (Wildcard) ->  ${SERVER_IP}  (DNS Only)"
echo ""
echo -e "${BOLD}🚀 Active Restored Platform Endpoints:${NC}"
echo -e "   • ${BOLD}Control Plane Dashboard:${NC}   https://cloud.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}Auth Gateway:${NC}              https://auth.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}Backend REST API:${NC}          https://api.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}Object Storage Gateway:${NC}    https://storage.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}Admin & Security Portal:${NC}   https://admin.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}User-Deployed Apps:${NC}        https://<project-slug>.${DETECTED_DOMAIN}"
echo ""
echo -e "To view logs anytime: ${CYAN}cd ${INSTALL_DIR} && sudo docker compose -f docker-compose.prod.yml logs -f${NC}"
echo "------------------------------------------------------------------"
