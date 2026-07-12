# ============================================================
# Stage 1: Builder
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile=false

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ============================================================
# Stage 2: Runner
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]
