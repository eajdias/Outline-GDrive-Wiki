# AGENTS.md — src/infra/

Compose do projeto (`outline-gdrive-wiki`, redes `kb-front`/`kb-back`): Outline + Postgres + Redis, AnythingLLM headless, llm-gateway, chat (`apps/chat`), importer (`apps/importer`) e edge openresty. Dockerfiles com contexto na raiz do repo.

- **Só o edge publica porta:** `127.0.0.1:8091` (`/`, `/chat/`, `/hooks/drive`, `/drive-image/`). Outline `:3000` serve o acesso direto; o resto nunca publica.
- **Produção** (`docker-compose.prod.yml`) remove as portas de dev com `!override` — `ports: []` sozinho **não** remove, porque o Compose soma listas no merge. O edge troca de `nginx.conf` para `nginx.tls.conf` (443 + redirect 80→443); o deploy falha antes de subir se `certs/fullchain.pem`/`privkey.pem` faltarem.
- **Rotas do edge não se duplicam:** ficam em `edge/routes.conf`, incluído pelos dois modos. Location nova entra só lá.
- **Importador:** one-shot com `docker compose run --rm --no-deps importer seed|apply|verify`; `up -d importer` para o `serve`. Webhook exige HTTPS público; no local, poll/`apply` resolve.
- `.env` nunca versionado; `.env.example` lista tudo, sem valor. Scripts em `scripts/`, com equivalente Linux no runbook.
- Conteúdo = Drive; `FILE_STORAGE=local` guarda só anexos/avatares (`outlinedata`). Sem nuvem.
- Todo serviço com estado tem `healthcheck` e `restart: unless-stopped`. **Nunca `down -v`** sem dump verificado.

Pronto: `docker compose config` válido, tudo `healthy`, `.env.example` em dia.
