FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
RUN npx prisma generate

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
    && npm run build \
    && npm prune --omit=dev \
    && npx prisma generate

FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js standalone output (server.js + minimal node_modules for the runtime)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Compiled worker
COPY --from=build /app/dist-worker ./dist-worker

# Full prisma + pg + genai + nodemailer for the worker and the migrate job.
# (next standalone trims these because the web server doesn't import them at runtime.)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=build /app/node_modules/@google ./node_modules/@google
COPY --from=build /app/node_modules/pg ./node_modules/pg
COPY --from=build /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=build /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=build /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=build /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=build /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=build /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=build /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=build /app/node_modules/postgres-interval ./node_modules/postgres-interval

EXPOSE 3000

# Compose overrides this per service:
#   app:        node server.js
#   worker:     node dist-worker/worker/index.js
#   app-migrate: npx prisma migrate deploy
CMD ["node", "server.js"]
