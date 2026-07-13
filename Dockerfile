# better-sqlite3 is a native addon — build it against glibc (not musl/alpine)
# in a throwaway stage, then ship only the compiled node_modules + source.
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY db ./db
COPY helpers ./helpers
COPY routes ./routes
COPY services ./services
COPY public ./public

RUN mkdir -p /app/data \
    && useradd --system --uid 1001 --home /app appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
