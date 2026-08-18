# KH Cloud ⚡
An open-source, self-hosted, full-stack cloud platform and lightweight alternative to Vercel, Supabase, Railway, and Netlify. Built on **NestJS**, **Next.js 15**, **Docker**, **Traefik v3**, **Redis**, **Prisma**, and **MinIO**.

---

## 🗺️ System Architecture

```mermaid
graph TD
    Client[User / Developer Browser] -->|HTTPS (Port 443)| Traefik[Traefik Edge Router & SSL Engine]
    
    subgraph Core Platform
        Traefik -->|cloud.domain.com| Frontend[Next.js 15 Dashboard]
        Traefik -->|api.domain.com| Backend[NestJS Cloud API Engine]
        Traefik -->|storage.domain.com| StorageCtrl[Object Storage Router]
        Backend -->|Internal| Redis[(Redis Rate Limiter & Cache)]
        Backend -->|Internal| DB[(SQLite / Prisma Database)]
        Backend -->|Internal :9000| MinIO[(MinIO Object Storage Cluster)]
    end

    subgraph Managed Cloud Services
        Backend -->|Docker Socket| Containers[Deployed Web Apps]
        Backend -->|Managed Instances| ManagedDatabases[PostgreSQL / MySQL / Redis]
        Backend -->|In-Process VM Sandbox| EdgeFunctions[Edge Functions Runtime]
    end

    GitHub[GitHub Webhooks] -->|GitOps Push Events| Backend
```

---

## 🚀 Key Features

### 1. 🌐 Web App Hosting & GitOps CI/CD
- **Vercel-style GitHub App Integration**: Selectively import private/public repositories without exposing your entire GitHub account.
- **Automated Builds & Rolling Deployments**: Push commits to `main` and KH Cloud will automatically clone, build, assign isolated ports, and route SSL domains via Traefik.
- **Custom Domains & SSL**: Automatic zero-config SSL certificates via Let's Encrypt for all apex domains and subdomains.
- **Environment Variables & Secrets**: Encrypted environment variable management per project.

### 2. 🗃️ Managed Databases (PostgreSQL, MySQL, Redis)
- **One-Click Provisioning**: Spin up dedicated database instances instantly.
- **Interactive Table Editor**: 2D-scrollable table viewer with sticky headers, pagination, and inline record CRUD.
- **Direct SQL Console**: Execute arbitrary queries and examine formatted tabular results.
- **HTTP REST Query API**: Query databases directly over secure HTTP with Team API keys (`kh_service_...` or `kh_anon_...`).
- **Connection Guides**: Pre-configured snippets for **Prisma ORM**, **SQLAlchemy**, **Node.js (`pg`, `mysql2`, `ioredis`)**, and **Python (`requests`)**.

### 3. 📦 Universal S3-Compatible Object Storage
- **Multi-Format Support**: Upload, store, and stream **PDFs**, **Images (JPG, PNG, WebP, SVG)**, **Videos (MP4, WebM)**, **Audio (MP3, WAV)**, **Documents (DOCX, XLSX, TXT, CSV, JSON)**, and **ZIP archives**.
- **In-Dashboard Previews**: Interactive inline PDF reader, HTML5 media player, and image viewers.
- **Team-Scoped Public & Signed URLs**:
  ```
  https://storage.khawarahemad.com/:teamId/:bucketName/:objectKey
  ```
- **S3 & REST API Compatibility**: Seamless integration with AWS SDK v3, `boto3`, cURL, or native `fetch`.

### 4. ⚡ Edge Functions (Serverless Compute)
- **Zero-Latency In-Process Execution**: Fast execution with sub-millisecond cold starts.
- **Built-In Global Helpers**: Direct sandbox context with `req`, `env`, `storage` (S3 get/list helpers), `db` (query runner), and `fetch`.
- **Public & Authenticated Invocations**: Trigger functions via REST with Team API keys.

### 5. 👥 Multi-Tenant Team System & RBAC
- **Isolated Workspaces**: Different teams can create resources with the same names (e.g. `avatars`, `production-db`, `auth-webhook`) without collisions.
- **Role-Based Access Control**: `OWNER`, `ADMIN`, `DEVELOPER`, and `VIEWER` roles with strict permissions.
- **Team Invitations**: Send, accept, or decline invites with dedicated role assignment.
- **Team API Keys**: Distinct `anon` (client-safe) and `service_role` (admin) keys.

### 6. 🛡️ DDoS Protection & Real-Time Traffic Analytics
- **Two-Tier Defense**: Traefik edge rate-limiting (network layer) + NestJS sliding-window token bucket in Redis (application layer).
- **Auto-Ban Engine**: Automatically bans abusive IPs with configurable TTLs and thresholds.
- **Live Traffic Visualizer**: Real-time request logging, status distributions, and instant Discord alerts.

---

## 🛠️ VPS Prerequisites & Server Setup

Recommended OS: **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS**.

### 1. Firewall Configuration (UFW)
Only expose ports 22 (SSH), 80 (HTTP), and 443 (HTTPS). Internal databases and containers remain shielded:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

### 2. Install Docker & Docker Compose
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
docker compose version
```

### 3. DNS Records Setup
Point your root domain and wildcard to your VPS IP on Cloudflare or your DNS registrar:

| Type | Name / Host | Target / IP | Proxy Status |
| :--- | :--- | :--- | :--- |
| **A** | `@` (Root) | `YOUR_VPS_IP` | DNS Only (Grey Cloud) |
| **A** | `*` (Wildcard) | `YOUR_VPS_IP` | DNS Only (Grey Cloud) |

---

## 🔑 Credentials & OAuth Setup

### 1. Google OAuth (User Login)
1. Go to [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services** > **Credentials**.
2. Create an **OAuth Client ID** (Web Application).
3. Set **Authorized JavaScript Origins**: `https://auth.yourdomain.com`, `https://cloud.yourdomain.com`.
4. Set **Authorized Redirect URIs**: `https://auth.yourdomain.com`.

### 2. GitHub App (Automated Deployments)
1. Navigate to GitHub > **Settings** > **Developer Settings** > **GitHub Apps** > **New GitHub App**.
2. Configure settings:
   - **App Name**: `KH Cloud Platform`
   - **Homepage URL**: `https://cloud.yourdomain.com`
   - **Callback URL**: `https://cloud.yourdomain.com`
   - **Setup URL**: `https://cloud.yourdomain.com` (Check **"Redirect on update"**)
   - **Webhook URL**: `https://api.yourdomain.com/api/github/webhook`
   - **Webhook Secret**: Enter a secure random string.
3. Permissions:
   - `Contents`: Read-only
   - `Metadata`: Read-only
   - `Webhooks`: Read & write
4. Subscribe to Events: Check **`Push`**.
5. Set **Where can this app be installed?** to **"Any account"**.
6. Generate and download a **Private Key (`.pem`)**.

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env` on your VPS:

```bash
cp .env.example .env
nano .env
```

Populate the required values:

```env
BASE_DOMAIN=khawarahemad.com

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub App Integration
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=kh-cloud-app
GITHUB_APP_CLIENT_ID=Iv23liDQkhKe8l...
GITHUB_APP_CLIENT_SECRET=your_github_app_client_secret
GITHUB_APP_WEBHOOK_SECRET=your_webhook_secret

# Multi-line PEM private key (replace real newlines with '\n')
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEA...-----END RSA PRIVATE KEY-----"

# MinIO S3 Object Storage
MINIO_ROOT_USER=khcloudroot
MINIO_ROOT_PASSWORD=khcloudrootpassword
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=khcloudroot
STORAGE_SECRET_KEY=khcloudrootpassword

# DDoS & Redis Configuration
REDIS_URL=redis://redis:6379
DDOS_AUTH_LIMIT=10
DDOS_API_LIMIT=60
DDOS_GLOBAL_LIMIT=200
DDOS_BAN_THRESHOLD=5
DDOS_BAN_TTL_SECONDS=3600
ADMIN_API_KEY=your-strong-random-admin-key
```

---

## 🚀 One-Command Deployment

Run the automated deployment script on your VPS:

```bash
chmod +x deploy.sh
./deploy.sh
```

### Manual Deploy / Updates:
```bash
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec -T backend npx prisma db push --accept-data-loss
```

---

## 🌐 Deployed Subdomains Overview

| Subdomain | Purpose |
| :--- | :--- |
| `https://cloud.yourdomain.com` | Primary Dashboard & Control Plane |
| `https://auth.yourdomain.com` | Dedicated OAuth & Session Authentication Hub |
| `https://api.yourdomain.com` | Backend REST API & Webhook Ingestion Engine |
| `https://storage.yourdomain.com` | Public S3 CDN & Object Serving Gateway |
| `https://admin.yourdomain.com` | System Admin & Traefik Control Center |
| `https://*.yourdomain.com` | Dynamic user-deployed projects & applications |

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
