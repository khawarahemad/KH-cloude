# KH Cloud ⚡
An open-source, self-hosted, full-stack cloud platform and lightweight alternative to Vercel, Supabase, Railway, and Netlify. Built on **NestJS**, **Next.js 15**, **Docker**, **Traefik v3**, **Redis**, **Prisma**, and **MinIO**.

Deploy full-stack web applications with automatic GitOps CI/CD, managed databases (Postgres, MySQL, Redis), S3-compatible object storage, edge functions, and DDoS protection—all under **your own custom domain** with zero code changes.

---

## 🗺️ System Architecture

```mermaid
graph TD
    Client[User / Developer Browser] -->|HTTPS (Port 443)| Traefik[Traefik Edge Router & SSL Engine]
    
    subgraph Core Platform
        Traefik -->|cloud.yourdomain.com| Frontend[Next.js 15 Dashboard]
        Traefik -->|api.yourdomain.com| Backend[NestJS Cloud API Engine]
        Traefik -->|storage.yourdomain.com| StorageCtrl[Object Storage Router]
        Traefik -->|auth.yourdomain.com| Frontend
        Traefik -->|admin.yourdomain.com| Frontend
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
- **Build & Runtime Environment Variables**: Native `.env` injection into Docker BuildKit and `--env-file` runtime container isolation with real-time UI redeploy triggers.

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
  https://storage.yourdomain.com/:teamId/:bucketName/:objectKey
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

## 🛠️ Step-by-Step Self-Hosting Guide

### Step 1: DNS Records Setup
Point your root domain and wildcard subdomain to your VPS IP address in Cloudflare or your DNS registrar:

| Type | Name / Host | Target / Value | Proxy Status |
| :--- | :--- | :--- | :--- |
| **A** | `@` (Apex Domain) | `YOUR_VPS_IP` | **DNS Only** (Grey Cloud) |
| **A** | `*` (Wildcard) | `YOUR_VPS_IP` | **DNS Only** (Grey Cloud) |

> [!IMPORTANT]
> If you are using Cloudflare, make sure the proxy status is set to **DNS Only (Grey Cloud)** so Traefik can automatically obtain Let's Encrypt TLS/SSL certificates.

---

### Step 2: VPS Prerequisites & Firewall
Recommended OS: **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS**.

#### 1. Configure UFW Firewall:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

#### 2. Install Docker & Docker Compose:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
docker compose version
```

---

### Step 3: Clone Repository & Configure `.env`

```bash
git clone https://github.com/khawarahemad/KH-cloude.git
cd KH-cloude
cp .env.example .env
nano .env
```

#### Configure your domain settings in `.env`:
```env
# Set your domain and Let's Encrypt email (no code edits needed!)
BASE_DOMAIN=yourdomain.com
ACME_EMAIL=admin@yourdomain.com

# Google OAuth (for user login)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth (optional sign-in)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# GitHub App Integration (for GitOps auto-deployments)
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=your-app-slug
GITHUB_APP_CLIENT_ID=Iv23li...
GITHUB_APP_CLIENT_SECRET=your_github_app_client_secret
GITHUB_APP_WEBHOOK_SECRET=your_webhook_secret
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEogIBAAKCAQEA...-----END RSA PRIVATE KEY-----"

# MinIO S3 Object Storage Credentials
MINIO_ROOT_USER=khcloudroot
MINIO_ROOT_PASSWORD=choose-a-secure-password

# Redis & DDoS Protection
REDIS_URL=redis://redis:6379
DDOS_AUTH_LIMIT=10
DDOS_API_LIMIT=60
DDOS_GLOBAL_LIMIT=200
DDOS_BAN_THRESHOLD=5
DDOS_BAN_TTL_SECONDS=3600
ADMIN_API_KEY=generate-a-strong-random-admin-key
```

---

### Step 4: OAuth & GitHub App Setup

#### A. Google OAuth Setup
1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (Application type: *Web application*).
3. Set **Authorized JavaScript origins**:
   - `https://auth.yourdomain.com`
   - `https://cloud.yourdomain.com`
4. Set **Authorized redirect URIs**:
   - `https://auth.yourdomain.com`
5. Paste `Client ID` and `Client Secret` into `.env`.

#### B. GitHub App Setup (for Continuous GitOps Deployments)
1. Go to GitHub > **Settings** > **Developer Settings** > **GitHub Apps** > [New GitHub App](https://github.com/settings/apps/new).
2. Fill in the required URLs (replace `yourdomain.com` with your `BASE_DOMAIN`):
   - **App Name**: `My Cloud Platform`
   - **Homepage URL**: `https://cloud.yourdomain.com`
   - **Callback URL**: `https://cloud.yourdomain.com`
   - **Setup URL**: `https://cloud.yourdomain.com` (Check **"Redirect on update"**)
   - **Webhook URL**: `https://api.yourdomain.com/api/github/webhook`
   - **Webhook Secret**: Enter a secret string (and copy it to `GITHUB_APP_WEBHOOK_SECRET`).
3. Set permissions:
   - `Repository permissions` → `Contents`: **Read-only**
   - `Repository permissions` → `Metadata`: **Read-only**
   - `Repository permissions` → `Webhooks`: **Read & write**
4. Subscribe to events: Check **`Push`**.
5. Where can this GitHub App be installed?: Select **"Any account"**.
6. Generate a **Private key (`.pem`)**, format newlines as `\n`, and save to `GITHUB_APP_PRIVATE_KEY` in `.env`.

---

### Step 5: Launch & Deploy

Run the automated deployment script:

```bash
chmod +x deploy.sh
./deploy.sh
```

Or deploy manually via Docker Compose:
```bash
sudo DOCKER_BUILDKIT=1 docker compose -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.prod.yml exec -T backend npx prisma db push --accept-data-loss
```

---

## 🌐 Deployed Endpoints Overview

Once deployed, the following subdomains are automatically routed with SSL certificates:

| Endpoint | Subdomain | Purpose |
| :--- | :--- | :--- |
| **Control Plane** | `https://cloud.yourdomain.com` | Next.js 15 Web Dashboard & Project Manager |
| **Auth Hub** | `https://auth.yourdomain.com` | Dedicated OAuth Session & Login Gateway |
| **API Engine** | `https://api.yourdomain.com` | Backend REST API & GitHub Webhook Receiver |
| **Object Storage** | `https://storage.yourdomain.com` | Public S3 Gateway & Media Streaming CDN |
| **Admin Console** | `https://admin.yourdomain.com` | System Administrator Portal & Metrics |
| **User Projects** | `https://<project-slug>.yourdomain.com` | Deployed Docker web apps & services |

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
