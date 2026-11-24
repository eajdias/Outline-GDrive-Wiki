FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/typescript-config ./packages/typescript-config
COPY packages/logger ./packages/logger
COPY packages/env ./packages/env
COPY packages/http ./packages/http
COPY apps/importer/package.json ./apps/importer/package.json
RUN npm ci --include=dev --no-audit --no-fund
COPY packages/logger/src ./packages/logger/src
COPY packages/env/src ./packages/env/src
COPY packages/http/src ./packages/http/src
COPY apps/importer ./apps/importer
RUN npm run build --workspace=@repo/logger --workspace=@repo/env --workspace=@repo/http --workspace=@kb/importer

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /data && chown node:node /data /app
COPY --from=build /app/apps/importer/dist ./dist
COPY --from=build /app/apps/importer/package.json ./
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${IMPORT_DRIVE_PORT:-8787}/healthz" || exit 1
ENTRYPOINT ["node", "dist/src/cli.js"]
CMD ["serve"]
