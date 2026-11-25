# AGENTS.md — src/infra/

Compose do projeto (`outline-gdrive-wiki`, redes `kb-front`/`kb-back`): Outline + Postgres + Redis, AnythingLLM headless, llm-gateway, chat (`apps/chat`), importer (`apps/importer`) e edge openresty. Dockerfiles com contexto na raiz do repo.

- **Só o edge publica porta:** `${EDGE_BIND_IP:-127.0.0.1}:8091` (`/`, `/chat/`, `/hooks/drive`, `/drive-image/`). Bind nunca `0.0.0.0` em host com IP público; teste privado via tailnet = `EDGE_BIND_IP` com o IP do Tailscale. Outline (`127.0.0.1:${OUTLINE_DIRECT_PORT:-3000}`) e uploads (`127.0.0.1:${UPLOADS_DIRECT_PORT:-8080}`) servem o acesso direto em loopback.
- **Produção dedicada** (`docker-compose.prod.yml`) remove as portas de dev com `!override` — `ports: []` sozinho **não** remove, porque o Compose soma listas no merge. O edge troca de `nginx.conf` para `nginx.tls.conf` (443 + redirect 80→443); o deploy falha antes de subir se `certs/fullchain.pem`/`privkey.pem` faltarem.
- **VPS compartilhada** (`docker-compose.vps.yml`, `DEPLOY_ENV=vps`): remove as portas diretas, edge segue em `127.0.0.1:8091` sem TLS; o TLS termina no reverse proxy do host (`host-nginx/wiki.conf.example`).
- **Rotas do edge não se duplicam:** ficam em `edge/routes.conf`, incluído pelos dois modos. Location nova entra só lá.
- **Importador:** one-shot com `docker compose run --rm --no-deps importer seed|apply|verify`; `up -d importer` para o `serve`. Webhook exige HTTPS público; no local, poll/`apply` resolve.
- `.env` nunca versionado; `.env.example` lista tudo, sem valor. Scripts em `scripts/`, com equivalente Linux no runbook.
- Conteúdo = Drive; `FILE_STORAGE=local` guarda só anexos/avatares (`outlinedata`). Sem nuvem.
- Todo serviço com estado tem `healthcheck` e `restart: unless-stopped`. **Nunca `down -v`** sem dump verificado.

Pronto: `docker compose config` válido, tudo `healthy`, `.env.example` em dia.
