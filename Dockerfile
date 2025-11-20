# ============================
# Stage 1: Build
# ============================
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json tsconfig.json ./

RUN npm ci

COPY . .

# Prisma generate (output đã chỉ định trong schema.prisma)
RUN npx prisma generate --schema=prisma/posts.prisma
RUN npx prisma generate --schema=prisma/users.prisma

RUN npm run build

# ============================
# Stage 2: Production image
# ============================
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# Copy Prisma client generated
COPY --from=builder /app/src/generated ./dist/generated

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
