FROM node:22.11.0-alpine AS deps
WORKDIR /build
RUN apk add --no-cache libc6-compat openssl
COPY package*.json .npmrc* ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

FROM deps AS build
WORKDIR /build
COPY . .
RUN npx prisma generate \
    && npm run build

FROM node:22.11.0-alpine AS production
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tini

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy the whole tree (Ask pattern). Bigger image but radically simpler
# than carving up node_modules — every selective copy was a separate
# failure mode.
COPY --from=build /build/.next/standalone ./
COPY --from=build /build/.next/static ./.next/static
COPY --from=build /build/public ./public
COPY --from=build /build/dist-worker ./dist-worker
COPY --from=build /build/prisma ./prisma
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/node_modules ./node_modules

EXPOSE 3000

# Compose drives the per-service command:
#   app:        node server.js
#   worker:     node dist-worker/worker/index.js
#   app-migrate: npx prisma migrate deploy
CMD ["node", "server.js"]
