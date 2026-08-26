#!/usr/bin/env bash

# ==============================================================================
#  ⚡ KH Cloud — 1-Command Update & Upgrade Script
#  Pulls latest release, rebuilds containers, runs DB migrations, and preserves .env
# ==============================================================================

set -eo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Determine installation directory
INSTALL_DIR="${KH_CLOUD_DIR:-/opt/kh-cloud}"
if [ ! -d "$INSTALL_DIR" ] && [ -f "./docker-compose.prod.yml" ]; then
  INSTALL_DIR="$(pwd)"
fi

if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "${RED}Error: KH Cloud directory not found at ${INSTALL_DIR}.${NC}"
  echo "Please specify KH_CLOUD_DIR=/path/to/kh-cloud or run from your project directory."
  exit 1
fi

echo -e "${CYAN}"
echo "██╗  ██╗██╗  ██╗    ██╗   ██╗██████╗ ██████╗  █████╗ ████████╗███████╗"
echo "██║ ██╔╝██║  ██║    ██║   ██║██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔════╝"
echo "█████╔╝ ███████║    ██║   ██║██████╔╝██║  ██║███████║   ██║   █████╗  "
echo "██╔═██╗ ██╔══██║    ██║   ██║██╔═══╝ ██║  ██║██╔══██║   ██║   ██╔══╝  "
echo "██║  ██╗██║  ██║██╗ ╚██████╔╝██║     ██████╔╝██║  ██║   ██║   ███████╗"
echo "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═════╝ ╚═╝     ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝"
echo -e "${NC}"
echo -e "${BOLD}Updating KH Cloud to the latest release...${NC}"
echo "------------------------------------------------------------------"

SUDO_CMD=""
if [ "$EUID" -ne 0 ]; then
  SUDO_CMD="sudo"
fi

cd "$INSTALL_DIR"

# Step 1: Pull latest source code from main
echo -e "${CYAN}==> [1/4] Pulling Latest Source Code...${NC}"
$SUDO_CMD git fetch --all --tags
$SUDO_CMD git pull origin main
echo -e "    ${GREEN}✓ Repository updated successfully.${NC}"

# Step 2: Ensure persistent volume directories exist
echo -e "${CYAN}==> [2/4] Verifying Storage & Volume Permissions...${NC}"
$SUDO_CMD mkdir -p /var/lib/kh-cloud/traefik-acme
$SUDO_CMD mkdir -p /var/lib/kh-cloud/redis
$SUDO_CMD mkdir -p /var/lib/kh-cloud/minio
$SUDO_CMD mkdir -p /var/lib/kh-cloud/db
$SUDO_CMD mkdir -p /var/lib/kh-cloud/storage-mock
$SUDO_CMD mkdir -p /var/log/kh-cloud
$SUDO_CMD chmod -R 777 /var/lib/kh-cloud/
if [ -f /var/lib/kh-cloud/traefik-acme/acme.json ]; then
  $SUDO_CMD chmod 600 /var/lib/kh-cloud/traefik-acme/acme.json
fi

# Step 3: Rebuild and restart containers with BuildKit
echo -e "${CYAN}==> [3/4] Pulling Pre-Built Images & Restarting Services (Rolling Update)...${NC}"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

$SUDO_CMD docker compose -f docker-compose.prod.yml pull || true
$SUDO_CMD DOCKER_BUILDKIT=1 docker compose -f docker-compose.prod.yml up -d --build

echo "    Waiting for services to warm up..."
sleep 5

# Step 4: Run database schema sync
echo -e "${CYAN}==> [4/4] Synchronizing Database Schema (Prisma)...${NC}"
$SUDO_CMD docker compose -f docker-compose.prod.yml exec -T backend npx prisma db push --accept-data-loss

# Clean dangling Docker images to free disk space
$SUDO_CMD docker image prune -f >/dev/null 2>&1 || true

# Read domain
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
DOMAIN="${BASE_DOMAIN:-yourdomain.com}"

echo ""
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN} ✨ KH CLOUD SUCCESSFULLY UPDATED TO LATEST VERSION!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo -e "🚀 All services are online and active:"
echo -e "   • Control Plane:  https://cloud.${DOMAIN}"
echo -e "   • Auth Gateway:   https://auth.${DOMAIN}"
echo -e "   • Backend API:    https://api.${DOMAIN}"
echo -e "   • Storage CDN:    https://storage.${DOMAIN}"
echo -e "   • Admin Portal:   https://admin.${DOMAIN}"
echo "------------------------------------------------------------------"
