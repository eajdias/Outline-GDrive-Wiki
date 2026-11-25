FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/typescript-config ./packages/typescript-config
COPY packages/logger ./packages/logger
COPY packages/env ./packages/env
COPY packages/http ./packages/http
COPY apps/chat/package.json ./apps/chat/package.json
RUN npm ci --include=dev --no-audit --no-fund
COPY packages/logger/src ./packages/logger/src
COPY packages/env/src ./packages/env/src
COPY packages/http/src ./packages/http/src
COPY apps/chat ./apps/chat
RUN npm run build --workspace=@repo/logger --workspace=@repo/env --workspace=@repo/http --workspace=@kb/chat

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN chown node:node /app
COPY package.json package-lock.json* ./
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/env/package.json ./packages/env/package.json
COPY packages/http/package.json ./packages/http/package.json
COPY apps/chat/package.json ./apps/chat/package.json
RUN npm ci --omit=dev --no-audit --no-fund && npm cache verify
COPY --from=build /app/apps/chat/dist ./dist
COPY --from=build /app/apps/chat/public ./public
COPY --from=build /app/packages/logger/dist ./node_modules/@repo/logger/dist
COPY --from=build /app/packages/env/dist ./node_modules/@repo/env/dist
COPY --from=build /app/packages/http/dist ./node_modules/@repo/http/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${CHAT_PORT:-8080}/healthz" || exit 1
ENTRYPOINT ["node", "dist/src/cli.js"]
