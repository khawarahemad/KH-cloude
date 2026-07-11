#!/bin/bash

# --- KH Cloud VPS Auto-Deploy Script ---
# Tested on Ubuntu 24.04

set -e

echo "=== [1/5] Updating VPS System Packages ==="
sudo apt-get update -y

# Check if Docker is installed
if ! [ -x "$(command -v docker)" ]; then
  echo "=== Docker not found. Installing Docker Engine ==="
  sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
  sudo mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

echo "=== [2/5] Provisioning Persistent Volume Directories ==="
sudo mkdir -p /var/lib/kh-cloud/traefik-acme
sudo mkdir -p /var/lib/kh-cloud/redis
sudo mkdir -p /var/lib/kh-cloud/minio
sudo mkdir -p /var/lib/kh-cloud/db
sudo mkdir -p /var/lib/kh-cloud/storage-mock

# Ensure correct permissions
sudo chmod -R 777 /var/lib/kh-cloud/
sudo touch /var/lib/kh-cloud/traefik-acme/acme.json
sudo chmod 600 /var/lib/kh-cloud/traefik-acme/acme.json

sudo docker compose -f docker-compose.prod.yml build --no-cache
sudo docker compose -f docker-compose.prod.yml up -d

echo "=== [4/5] Running Database Schema Sync (Prisma) ==="
# Allow backend container 5 seconds to warm up
sleep 5

# Synchronize database tables inside the running backend container
sudo docker compose -f docker-compose.prod.yml exec -T backend npx prisma db push --accept-data-loss

echo "=== [5/5] Deployment Successful! ==="
echo "KH Cloud services are now online on VPS 204.168.147.13!"
echo "Please make sure your DNS records for khawarahemad.com subdomains point to this IP."
echo "Access Dashboard at: https://cloud.khawarahemad.com"
echo "Access S3 API Endpoint at: https://storage.khawarahemad.com"
echo "Access Traefik admin dashboard at: https://admin.khawarahemad.com"
