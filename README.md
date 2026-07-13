# KH Cloud ⚡
An open-source, self-hosted, lightweight alternative to Vercel, Railway, and Netlify. Built on NestJS, Next.js, Docker, Traefik, Redis, and MinIO.

## 🗺️ System Architecture

```mermaid
graph TD
    Client[User Browser] -->|HTTPS| Traefik[Traefik Router]
    Traefik -->|Port 3000| Frontend[Next.js Frontend]
    Traefik -->|Port 5000| Backend[NestJS Backend]
    Traefik -->|Port 9000| MinIO[MinIO Object Storage]
    Backend -->|Cache| Redis[Redis Cache]
    Backend -->|Data| SQLite[(SQLite Database)]
    GitHub[GitHub Webhooks] -->|Push Events| Traefik
```

---

## 🚀 Key Features
- **Vercel-style GitHub App Integration**: Selectively authorize access to specific repositories instead of sharing your entire GitHub account.
- **GitOps Auto-Deployments**: Push to main/master on GitHub, and your application will automatically build, deploy, and restart.
- **Dynamic Routing & SSL**: Managed automatically using Traefik and Let's Encrypt certificates.
- **S3-compatible Storage**: MinIO instance pre-configured for asset storage.
- **Zustand Cached UI**: Extremely fast tab-switching and navigation.

---

## 🛠️ VPS Infrastructure Prerequisites

Before deploying KH Cloud, prepare your Linux VPS (Ubuntu 22.04+ recommended).

### 1. Secure Your VPS (UFW Firewall Setup)
Securing ports is critical. Keep only HTTP, HTTPS, and SSH public, and block everything else (e.g. databases, internal services) from the outside world:

```bash
# Enable UFW (Uncomplicated Firewall)
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (Port 22)
sudo ufw allow 22/tcp

# Allow HTTP & HTTPS (Ports 80 & 443) for Traefik routing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check firewall status
sudo ufw status verbose
```

### 2. Install Docker & Docker Compose
Ensure Docker Engine and Docker Compose are installed on your VPS:

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Verify installation
docker --version
docker compose version
```

### 3. Configure DNS Records
You need to point your domain name to your VPS IP address. Set up these records on your DNS provider (e.g., Cloudflare, GoDaddy):

| Record Type | Host / Name | Value / Points to | TTL |
|---|---|---|---|
| **A** | `@` (Root) | `YOUR_VPS_PUBLIC_IP` | Auto |
| **A** | `*` (Wildcard) | `YOUR_VPS_PUBLIC_IP` | Auto |

*Note: The wildcard record is crucial because KH Cloud dynamically assigns subdomains for your projects and databases.*

---

## 🔑 Integration Credentials Setup

To enable user sign-in and git-based deployments, you must configure Google OAuth and a GitHub App.

### 1. Google OAuth Client (User Login)
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and navigate to **APIs & Services** > **Credentials**.
3. Create an **OAuth Client ID** for a Web Application.
4. Add the following Redirect URIs:
   - Authorized JavaScript origins: `https://auth.yourdomain.com`
   - Authorized redirect URIs: `https://auth.yourdomain.com`

### 2. GitHub App (Vercel-style Import & Deployment)
1. Navigate to your GitHub profile settings > **Developer settings** > **GitHub Apps** > **New GitHub App**.
2. Configure settings:
   - **GitHub App name**: `KH Cloud App` (or any custom name)
   - **Homepage URL**: `https://cloud.yourdomain.com`
   - **Callback URL**: `https://auth.yourdomain.com`
   - **Setup URL**: `https://cloud.yourdomain.com` (Check **"Redirect on update"**)
   - **Webhook**: Check **Active**
   - **Webhook URL**: `https://api.yourdomain.com/api/github/webhook`
   - **Webhook Secret**: Choose a random, strong secret string.
3. Under **Permissions & Events** (left sidebar):
   - **Repository Permissions**:
     * `Contents`: Read-only (required to pull source code)
     * `Metadata`: Read-only
     * `Webhooks`: Read & write
   - **Subscribe to events**:
     * Check **`Push`** (triggers automatic deploys when code is pushed)
4. Under **Where can this app be installed?**: Select **"Any account"** (for multi-tenant setups).
5. Click **Create GitHub App**.
6. After creation:
   - Note the **App ID**, **Client ID**, and **Client Secret**.
   - Under **Private keys**, click **Generate a private key**. Download the `.pem` file.

---

## ⚙️ Environment Variables Configuration

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Edit the `.env` file and replace the placeholders:

```env
BASE_DOMAIN=yourdomain.com

# Google OAuth (sign-in)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub App Integration
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=kh-cloud-app
GITHUB_APP_CLIENT_ID=Iv23liDQkhKe8lcf4DiV
GITHUB_APP_CLIENT_SECRET=your_github_app_client_secret

# Webhook secret (must match the webhook secret on GitHub App settings page)
GITHUB_APP_WEBHOOK_SECRET=your_webhook_hmac_secret_string

# GitHub App Private Key (PEM format, multi-line string on one line)
# Open the downloaded .pem file, copy all lines, and replace real newlines with '\n'
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEA...your_key...-----END RSA PRIVATE KEY-----"
```

---

## 🚀 Deployment

Run the deploy script directly on your VPS. The script will pull updates, build containers, run database migrations, and restart the Traefik router:

```bash
# Clone the repository
git clone https://github.com/khawarahemad/KH-cloude.git
cd KH-cloude

# Create your .env file
nano .env

# Deploy using the script
chmod +x deploy.sh
./deploy.sh
```

To view running containers:
```bash
docker ps
```

To inspect backend logs:
```bash
docker logs -f kh-cloud-backend
```

---

## 🔒 Security Recommendations
- **MinIO Credentials**: Change the default username and password for MinIO (`MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`) in `docker-compose.prod.yml` before deploying to production.
- **Secrets Management**: Keep your `.env` private key and webhook secret safe.
- **Certificates**: Traefik automatically provisions ACME Let's Encrypt certificates. Ensure port 80 is not blocked so Let's Encrypt HTTP-01 challenge succeeds.
