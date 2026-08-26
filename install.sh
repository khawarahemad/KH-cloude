#!/usr/bin/env bash

# ==============================================================================
#  ⚡ KH Cloud — The Modern Open-Source Self-Hosted Cloud Platform
#  Automated 1-Command Installation & Setup Wizard
# ==============================================================================

set -eo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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
  echo -e "${BOLD}The Open-Source Alternative to Vercel, Supabase & Railway${NC}"
  echo "------------------------------------------------------------------"
  echo ""
}

print_banner

# Step 1: Detect architecture & OS
echo -e "${CYAN}==> [1/6] Detecting System Environment...${NC}"
OS="$(uname -s)"
ARCH="$(uname -m)"
echo -e "    OS: ${GREEN}${OS}${NC} | Architecture: ${GREEN}${ARCH}${NC}"

# Ensure running with sufficient privileges
if [ "$EUID" -ne 0 ] && ! command -v sudo &> /dev/null; then
  echo -e "${RED}Error: Please run this script as root or install sudo.${NC}"
  exit 1
fi

SUDO_CMD=""
if [ "$EUID" -ne 0 ]; then
  SUDO_CMD="sudo"
fi

# Step 2: Install Docker and Docker Compose if not present
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

# Step 3: Clone or update repository
echo -e "${CYAN}==> [3/6] Setting Up Project Workspace at ${INSTALL_DIR}...${NC}"
$SUDO_CMD mkdir -p "$INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "    Updating existing repository in ${INSTALL_DIR}..."
  cd "$INSTALL_DIR"
  $SUDO_CMD git pull origin main
else
  echo -e "    Cloning KH Cloud repository into ${INSTALL_DIR}..."
  $SUDO_CMD git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Step 4: Configure .env
echo -e "${CYAN}==> [4/6] Configuring Environment & Domain Settings...${NC}"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    $SUDO_CMD cp .env.example .env
  else
    $SUDO_CMD touch .env
  fi

  # Interactive prompts if terminal is attached
  if [ -t 0 ] && [ -z "$BASE_DOMAIN" ]; then
    echo ""
    echo -e "${BOLD}Please enter your root domain (e.g. mycloud.io, yourdomain.com):${NC}"
    read -r -p "Domain: " USER_DOMAIN
    if [ -n "$USER_DOMAIN" ]; then
      BASE_DOMAIN="$USER_DOMAIN"
    fi

    echo -e "${BOLD}Please enter your email for Let's Encrypt SSL certificates:${NC}"
    read -r -p "Email: " USER_EMAIL
    if [ -n "$USER_EMAIL" ]; then
      ACME_EMAIL="$USER_EMAIL"
    fi
  fi

  BASE_DOMAIN="${BASE_DOMAIN:-yourdomain.com}"
  ACME_EMAIL="${ACME_EMAIL:-admin@${BASE_DOMAIN}}"
  
  # Generate secure random secrets
  GENERATED_ADMIN_KEY=$(openssl rand -hex 24 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
  GENERATED_MINIO_PASSWORD=$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | base64 | head -c 24)

  $SUDO_CMD sed -i.bak "s|^BASE_DOMAIN=.*|BASE_DOMAIN=${BASE_DOMAIN}|" .env || true
  $SUDO_CMD sed -i.bak "s|^ACME_EMAIL=.*|ACME_EMAIL=${ACME_EMAIL}|" .env || true
  $SUDO_CMD sed -i.bak "s|^ADMIN_API_KEY=.*|ADMIN_API_KEY=${GENERATED_ADMIN_KEY}|" .env || true
  $SUDO_CMD sed -i.bak "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${GENERATED_MINIO_PASSWORD}|" .env || true
  $SUDO_CMD rm -f .env.bak
fi

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
echo -e "${CYAN}==> [6/6] Building & Launching KH Cloud Cluster with BuildKit...${NC}"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

$SUDO_CMD DOCKER_BUILDKIT=1 docker compose -f docker-compose.prod.yml up -d --build

echo "    Waiting for services to initialize..."
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
SERVER_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "YOUR_VPS_IP")

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} 🎉 KH CLOUD DEPLOYMENT COMPLETED SUCCESSFULLY!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo -e "${BOLD}Server IP:${NC} ${CYAN}${SERVER_IP}${NC}"
echo -e "${BOLD}Configured Root Domain:${NC} ${CYAN}${DETECTED_DOMAIN}${NC}"
echo ""
echo -e "${YELLOW}👉 Make sure your DNS records (@ and * wildcard) point to ${SERVER_IP}:${NC}"
echo "   • Type A:  @ (Apex)     ->  ${SERVER_IP}  (DNS Only)"
echo "   • Type A:  * (Wildcard) ->  ${SERVER_IP}  (DNS Only)"
echo ""
echo -e "${BOLD}🚀 Active Platform Access Points:${NC}"
echo -e "   • ${BOLD}Control Plane Dashboard:${NC}   https://cloud.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}Authentication Gateway:${NC}    https://auth.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}Backend REST API Engine:${NC}   https://api.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}Object Storage Gateway:${NC}    https://storage.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}Admin & Traefik Portal:${NC}    https://admin.${DETECTED_DOMAIN}"
echo -e "   • ${BOLD}User-Deployed Web Apps:${NC}    https://<project-slug>.${DETECTED_DOMAIN}"
echo ""
echo -e "To view logs anytime: ${CYAN}cd ${INSTALL_DIR} && sudo docker compose -f docker-compose.prod.yml logs -f${NC}"
echo "------------------------------------------------------------------"
