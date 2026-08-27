# --- Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install Alpine build tools for native C++ modules (like better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma.config.ts ./
COPY tsconfig*.json ./
COPY prisma ./prisma/

# Install dependencies including devDependencies for build
RUN npm ci

COPY src ./src/

# Generate Prisma client and compile TypeScript to JavaScript
RUN npx prisma generate
RUN npm run build

# Remove development dependencies to leave only production packages
RUN npm prune --omit=dev

# --- Production Stage ---
FROM node:22-alpine AS runner

# Install git, docker-cli, and docker-cli-buildx for modern BuildKit live deployment engine
RUN apk add --no-cache git docker-cli docker-cli-buildx

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Copy compiled production node_modules and code from builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production
ENV DOCKER_BUILDKIT=1
ENV COMPOSE_DOCKER_CLI_BUILD=1

CMD ["node", "dist/src/main"]
