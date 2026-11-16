# syntax=docker/dockerfile:1

# ---- build ----
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/todo.db \
    STATIC_DIR=/app/frontend/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
# Only backend runtime deps (includes the prisma CLI for `migrate deploy`)
RUN npm ci --omit=dev --workspace backend --include-workspace-root=false
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend/dist
VOLUME /data
EXPOSE 3000
WORKDIR /app/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
