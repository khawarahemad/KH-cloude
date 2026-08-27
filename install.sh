#!/usr/bin/env bash

# ==============================================================================
#  ⚡ KH Cloud — The Modern Open-Source Self-Hosted Cloud Platform
#  Interactive Guided Installation Wizard for Beginners & Production Servers
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
  echo "██╗  ██╗██╗  ██╗    ██████╗██╗      ██████╗ ██╗   ██╗██████╗ "
  echo "██║ ██╔╝██║  ██║   ██╔════╝██║     ██╔═══██╗██║   ██║██╔══██╗"
  echo "█████╔╝ ███████║   ██║     ██║     ██║   ██║██║   ██║██║  ██║"
  echo "██╔═██╗ ██╔══██║   ██║     ██║     ██║   ██║██║   ██║██║  ██║"
  echo "██║  ██╗██║  ██║██╗╚██████╗███████╗╚██████╔╝╚██████╔╝██████╔╝"
  echo "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝ ╚═════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ "
  echo -e "${NC}"
  echo -e "${BOLD}Enterprise-Grade Self-Hosted Cloud Platform${NC}"
  echo -e "${DIM}Alternative to Vercel, Supabase, Railway & Netlify${NC}"
  echo "------------------------------------------------------------------"
  echo ""
}

print_banner

# Step 1: Detect Architecture & Privileges
echo -e "${CYAN}==> [1/6] Detecting System Environment...${NC}"
OS="$(uname -s)"
ARCH="$(uname -m)"
echo -e "    OS: ${GREEN}${OS}${NC} | Architecture: ${GREEN}${ARCH}${NC}"

SUDO_CMD=""
if [ "$EUID" -ne 0 ]; then
  if ! command -v sudo &> /dev/null; then
    echo -e "${RED}Error: Please run this script as root or install sudo.${NC}"
    exit 1
  fi
  SUDO_CMD="sudo"
fi

# Step 2: Install Docker Engine and Compose Plugin
echo -e "${CYAN}==> [2/6] Checking Docker Engine & Compose Plugin...${NC}"
if ! command -v docker &> /dev/null; then
  echo -e "    ${YELLOW}Docker not found. Installing Docker Engine...${NC}"
  if command -v apt-get &> /dev/null; then
    $SUDO_CMD apt-get update -y
    $SUDO_CMD apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release git
    $SUDO_CMD mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO_CMD gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | $SUDO_CMD tee /etc/apt/sources.list.d/docker.list > /dev/null
    $SUDO_CMD apt-get update -y
    $SUDO_CMD apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin
  else
    curl -fsSL https://get.docker.com | $SUDO_CMD sh
  fi
  echo -e "    ${GREEN}✓ Docker Engine successfully installed!${NC}"
else
  echo -e "    ${GREEN}✓ Docker Engine detected: $(docker --version)${NC}"
fi

# Step 3: Clone or Update Project Repository
echo -e "${CYAN}==> [3/6] Setting Up Project Workspace at ${INSTALL_DIR}...${NC}"
$SUDO_CMD mkdir -p "$INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "    Updating existing repository in ${INSTALL_DIR}..."
  cd "$INSTALL_DIR"
  $SUDO_CMD git fetch --all
  $SUDO_CMD git reset --hard origin/main
else
  echo -e "    Cloning KH Cloud repository into ${INSTALL_DIR}..."
  $SUDO_CMD git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Attach terminal for interactive inputs when piped via curl | bash
if [ -c /dev/tty ]; then
  exec < /dev/tty
fi

# Step 4: Interactive Credentials & Domain Configuration Wizard
echo -e "${CYAN}==> [4/6] Interactive Setup Wizard (Domain & Credentials)...${NC}"
echo ""

# 4.1 Base Domain & Email
if [ -z "$BASE_DOMAIN" ]; then
  echo -e "${BOLD}1. Domain Configuration${NC}"
  echo -e "${DIM}Enter the root domain you want to use (e.g. yourdomain.com, mycloud.io):${NC}"
  read -r -p "   Root Domain [yourdomain.com]: " INPUT_DOMAIN
  BASE_DOMAIN="${INPUT_DOMAIN:-yourdomain.com}"
fi

if [ -z "$ACME_EMAIL" ]; then
  DEFAULT_EMAIL="admin@${BASE_DOMAIN}"
  echo -e "${DIM}Enter your email for Let's Encrypt automated SSL certificate issuance:${NC}"
  read -r -p "   SSL Admin Email [${DEFAULT_EMAIL}]: " INPUT_EMAIL
  ACME_EMAIL="${INPUT_EMAIL:-$DEFAULT_EMAIL}"
fi

echo ""

# 4.2 Google OAuth (Optional)
echo -e "${BOLD}2. Google OAuth Configuration (for Dashboard Login)${NC}"
echo -e "${DIM}Used for one-click Google Sign-in to your control plane (can be skipped and added later in .env).${NC}"
read -r -p "   Do you have Google OAuth credentials ready? [y/N]: " SETUP_GOOGLE
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
if [[ "$SETUP_GOOGLE" =~ ^[Yy]$ ]]; then
  read -r -p "   Google Client ID: " GOOGLE_CLIENT_ID
  read -r -p "   Google Client Secret: " GOOGLE_CLIENT_SECRET
fi

echo ""

# 4.3 GitHub App GitOps (Optional)
echo -e "${BOLD}3. GitHub App Integration (for Automated GitOps Deployments)${NC}"
echo -e "${DIM}Allows continuous auto-deployments when pushing code to GitHub (can be configured later).${NC}"
read -r -p "   Do you have a GitHub App ready? [y/N]: " SETUP_GITHUB
GITHUB_APP_ID=""
GITHUB_APP_SLUG=""
GITHUB_APP_CLIENT_ID=""
GITHUB_APP_CLIENT_SECRET=""
GITHUB_APP_WEBHOOK_SECRET=""
GITHUB_APP_PRIVATE_KEY=""

if [[ "$SETUP_GITHUB" =~ ^[Yy]$ ]]; then
  read -r -p "   GitHub App ID: " GITHUB_APP_ID
  read -r -p "   GitHub App Slug / Name: " GITHUB_APP_SLUG
  read -r -p "   GitHub App Client ID: " GITHUB_APP_CLIENT_ID
  read -r -p "   GitHub App Client Secret: " GITHUB_APP_CLIENT_SECRET
  read -r -p "   GitHub App Webhook Secret: " GITHUB_APP_WEBHOOK_SECRET
  
  echo -e "${DIM}Provide the path to your downloaded GitHub Private Key (.pem file) or paste it:${NC}"
  read -r -p "   Private Key .pem file path (e.g. /root/my-app.private-key.pem) or [Enter to skip]: " PEM_PATH
  if [ -n "$PEM_PATH" ] && [ -f "$PEM_PATH" ]; then
    GITHUB_APP_PRIVATE_KEY=$(awk '{printf "%s\\n", $0}' "$PEM_PATH")
    echo -e "   ${GREEN}✓ Private key formatted successfully from file.${NC}"
  fi
fi

echo ""

# 4.4 Security & Storage Passwords
echo -e "${BOLD}4. Platform Security & S3 Storage Credentials${NC}"
GEN_ADMIN_KEY=$(openssl rand -hex 24 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
GEN_MINIO_PWD=$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | base64 | head -c 24)
GEN_BACKUP_KEY=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)

read -r -p "   Custom Admin API Key [Enter to auto-generate secure key]: " CUSTOM_ADMIN_KEY
ADMIN_API_KEY="${CUSTOM_ADMIN_KEY:-$GEN_ADMIN_KEY}"

read -r -p "   Platform Admin Email (for automatic ADMIN role): " PLATFORM_ADMIN_EMAIL

read -r -p "   MinIO S3 Root Password [Enter to auto-generate secure password]: " CUSTOM_MINIO_PWD
MINIO_ROOT_PASSWORD="${CUSTOM_MINIO_PWD:-$GEN_MINIO_PWD}"
MINIO_ROOT_USER="khcloudroot"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-$GEN_BACKUP_KEY}"

echo ""
echo -e "${GREEN}==> Writing secure configuration to .env...${NC}"

# Write clean .env file
$SUDO_CMD bash -c "cat > .env" <<EOF
# ==============================================================================
#  ⚡ KH Cloud Production Environment Configuration
#  Auto-Generated by install.sh on $(date -u)
# ==============================================================================

# Domain & SSL Settings
BASE_DOMAIN=${BASE_DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
PLATFORM_ADMIN_EMAIL=${PLATFORM_ADMIN_EMAIL}
ADMIN_API_KEY=${ADMIN_API_KEY}
BACKUP_ENCRYPTION_KEY=${BACKUP_ENCRYPTION_KEY}

# MinIO S3-Compatible Object Storage Credentials
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_ENDPOINT=https://storage.${BASE_DOMAIN}
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=${MINIO_ROOT_USER}
STORAGE_SECRET_KEY=${MINIO_ROOT_PASSWORD}

# Google OAuth (Dashboard Sign-in)
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}

# GitHub App (GitOps Auto-Deployments)
GITHUB_APP_ID=${GITHUB_APP_ID}
GITHUB_APP_SLUG=${GITHUB_APP_SLUG}
GITHUB_APP_CLIENT_ID=${GITHUB_APP_CLIENT_ID}
GITHUB_APP_CLIENT_SECRET=${GITHUB_APP_CLIENT_SECRET}
GITHUB_APP_WEBHOOK_SECRET=${GITHUB_APP_WEBHOOK_SECRET}
GITHUB_APP_PRIVATE_KEY="${GITHUB_APP_PRIVATE_KEY}"

# Redis & Rate Limiting Engine
REDIS_URL=redis://redis:6379
DDOS_GLOBAL_LIMIT=200
DDOS_API_LIMIT=60
DDOS_AUTH_LIMIT=10
DDOS_BAN_THRESHOLD=5
DDOS_BAN_TTL_SECONDS=3600
DDOS_ALERT_DISCORD_WEBHOOK=

# Frontend Environment Variables
NEXT_PUBLIC_BASE_DOMAIN=${BASE_DOMAIN}
NEXT_PUBLIC_API_URL=https://api.${BASE_DOMAIN}
NEXT_PUBLIC_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
EOF

$SUDO_CMD chmod 600 .env

# Step 5: Provision Storage and ACME volumes
echo -e "${CYAN}==> [5/6] Initializing Persistent Data Volumes...${NC}"
$SUDO_CMD mkdir -p /var/lib/kh-cloud/traefik-acme
$SUDO_CMD mkdir -p /var/lib/kh-cloud/redis
$SUDO_CMD mkdir -p /var/lib/kh-cloud/minio
$SUDO_CMD mkdir -p /var/lib/kh-cloud/db
$SUDO_CMD mkdir -p /var/lib/kh-cloud/storage-mock
$SUDO_CMD mkdir -p /var/log/kh-cloud

$SUDO_CMD chmod -R 777 /var/lib/kh-cloud/
$SUDO_CMD touch /var/lib/kh-cloud/traefik-acme/acme.json
$SUDO_CMD chmod 600 /var/lib/kh-cloud/traefik-acme/acme.json

# Step 6: Build and Launch Containers
echo -e "${CYAN}==> [6/6] Launching KH Cloud Cluster (Fast GHCR Pull & Launch)...${NC}"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

$SUDO_CMD docker compose -f docker-compose.prod.yml pull || true
$SUDO_CMD docker compose -f docker-compose.prod.yml up -d --build

echo "    Waiting for cluster services to initialize..."
sleep 6

# Synchronize database schema inside backend
$SUDO_CMD docker compose -f docker-compose.prod.yml exec -T backend npx prisma db push --accept-data-loss

SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "YOUR_SERVER_IP")

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} 🎉 KH CLOUD DEPLOYMENT COMPLETED SUCCESSFULLY!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo -e "${BOLD}Server Public IP:${NC}       ${CYAN}${SERVER_IP}${NC}"
echo -e "${BOLD}Configured Root Domain:${NC} ${CYAN}${BASE_DOMAIN}${NC}"
echo -e "${BOLD}Admin API Key:${NC}          ${YELLOW}${ADMIN_API_KEY}${NC}"
echo -e "${BOLD}MinIO S3 Password:${NC}      ${YELLOW}${MINIO_ROOT_PASSWORD}${NC}"
echo ""
echo -e "${YELLOW}👉 Make sure your DNS A-Records point to ${SERVER_IP}:${NC}"
echo "   • Type A:  @ (Apex)     ->  ${SERVER_IP}  (DNS Only)"
echo "   • Type A:  * (Wildcard) ->  ${SERVER_IP}  (DNS Only)"
echo ""
echo -e "${BOLD}🚀 Active Platform Access Points:${NC}"
echo -e "   • ${BOLD}Control Plane Dashboard:${NC}   https://cloud.${BASE_DOMAIN}"
echo -e "   • ${BOLD}Auth & Login Hub:${NC}          https://auth.${BASE_DOMAIN}"
echo -e "   • ${BOLD}REST API Engine:${NC}           https://api.${BASE_DOMAIN}"
echo -e "   • ${BOLD}Object Storage Gateway:${NC}    https://storage.${BASE_DOMAIN}"
echo -e "   • ${BOLD}Admin & Security Portal:${NC}   https://admin.${BASE_DOMAIN}"
echo -e "   • ${BOLD}User Deployed Apps:${NC}        https://<project-slug>.${BASE_DOMAIN}"
echo ""
echo -e "To view live logs: ${CYAN}cd ${INSTALL_DIR} && sudo docker compose -f docker-compose.prod.yml logs -f${NC}"
echo "------------------------------------------------------------------"
