# Dockerfile — multi-stage build for Ghazwah ServiceHub.
# Stage 1: Build backend + frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Install backend deps
COPY package.json package-lock.json ./
RUN npm ci

# Install frontend deps + build
COPY client/ ./client/
WORKDIR /app/client
RUN npm ci && npm run build

# Build backend
WORKDIR /app
COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/server/migrations/ ./server/migrations/
COPY --from=builder /app/client/dist/ ./client/dist/

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Run migration + start server
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
