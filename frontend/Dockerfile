# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./
COPY next.config.ts ./
COPY postcss.config.mjs ./

# Install all dependencies
RUN npm ci

COPY src ./src/
COPY public ./public/

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_GITHUB_CLIENT_ID
ENV NEXT_PUBLIC_GITHUB_CLIENT_ID=$NEXT_PUBLIC_GITHUB_CLIENT_ID

RUN npm run build

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./
COPY next.config.ts ./

# Install only production dependencies
RUN npm ci --only=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["npm", "run", "start"]
