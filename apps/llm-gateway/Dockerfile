FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/typescript-config ./packages/typescript-config
COPY packages/logger ./packages/logger
COPY packages/env ./packages/env
COPY apps/llm-gateway/package.json ./apps/llm-gateway/package.json
RUN npm ci --include=dev --no-audit --no-fund
COPY packages/logger/src ./packages/logger/src
COPY packages/env/src ./packages/env/src
COPY apps/llm-gateway ./apps/llm-gateway
RUN npm run build --workspace=@repo/logger --workspace=@repo/env --workspace=@kb/llm-gateway

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN chown node:node /app
COPY package.json package-lock.json* ./
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/env/package.json ./packages/env/package.json
COPY apps/llm-gateway/package.json ./apps/llm-gateway/package.json
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/llm-gateway/dist ./dist
COPY --from=build /app/packages/logger/dist ./node_modules/@repo/logger/dist
COPY --from=build /app/packages/env/dist ./node_modules/@repo/env/dist
USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${LLM_GATEWAY_PORT:-8090}/healthz" || exit 1
ENTRYPOINT ["node", "dist/src/cli.js"]
