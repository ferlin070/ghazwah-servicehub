FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY server/ ./server/
COPY client/ ./client/
RUN npm run build
RUN cd client && npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/server/dist/ ./server/dist/
COPY --from=builder /app/client/dist/ ./client/dist/
COPY server/migrations/ ./server/migrations/
EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm start"]
