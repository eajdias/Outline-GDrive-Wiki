FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY src ./src
COPY test ./test
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /app && chown node:node /app
COPY --from=build /app/dist ./dist
COPY public ./public
COPY package.json ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${CHAT_PORT:-8080}/healthz" || exit 1
ENTRYPOINT ["node", "dist/src/cli.js"]
