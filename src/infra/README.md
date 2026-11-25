# src/infra — stack Docker

Compose do Outline + Postgres + Redis, AnythingLLM headless, chat UI, edge openresty e importador Drive. Comandos de operação em [`docs/runbook.md`](../../docs/runbook.md).

```powershell
docker compose -f src/infra/docker-compose.yml up -d
docker compose -f src/infra/docker-compose.yml ps
docker compose -f src/infra/docker-compose.yml logs -f outline
```

| Serviço | Porta | Papel |
|---|---|---|
| `outline` | 127.0.0.1:`OUTLINE_DIRECT_PORT` (3000, acesso direto) | wiki de leitura |
| `postgres` / `redis` | internas | persistência do Outline |
| `llm-gateway` | interna (8090) | rota chat/embeddings entre o AnythingLLM e os provedores; roda chaves e provedores no 429 |
| `anythingllm` | interna | RAG headless, só `/api/v1` (`kb-drive`) |
| `chat` | interna | pergunta/resposta com citações |
| `importer` | interna (8787) | `serve` + one-shot `seed`/`apply`/`verify` |
| `edge` | 127.0.0.1:8091 | wiki + `/chat/` + `/hooks/drive` + `/drive-image/` |
| `uploads` | 127.0.0.1:`UPLOADS_DIRECT_PORT` (8080) | nginx legado de anexos antigos |

Modos: local (`up -d`, portas de acesso direto em loopback) · host dedicado (`-f docker-compose.prod.yml`: só o edge publica 80/443 com TLS) · host compartilhado (`-f docker-compose.vps.yml` ou `DEPLOY_ENV=vps`: sem portas diretas, edge segue em 127.0.0.1:8091 atrás do reverse proxy do host — ver `host-nginx/wiki.conf.example`). Os overlays removem as portas com `!override`; `ports: []` sozinho não remove.

`.env` a partir de `.env.example` (nunca versionado). Conteúdo vem do Drive; `outlinedata` guarda só anexos/avatares.
