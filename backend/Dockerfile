# --- Build Stage ---
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS runner

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

CMD ["node", "dist/src/main"]
