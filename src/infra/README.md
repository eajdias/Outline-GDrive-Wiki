# src/infra — stack Docker

Compose do Outline + Postgres + Redis, AnythingLLM headless, chat UI, edge openresty e importador Drive. Comandos de operação em [`docs/runbook.md`](../../docs/runbook.md).

```powershell
docker compose -f src/infra/docker-compose.yml up -d
docker compose -f src/infra/docker-compose.yml ps
docker compose -f src/infra/docker-compose.yml logs -f outline
```

| Serviço | Porta | Papel |
|---|---|---|
| `outline` | 3000 (acesso direto) | wiki de leitura |
| `postgres` / `redis` | internas | persistência do Outline |
| `anythingllm` | interna | RAG headless, só `/api/v1` (`kb-drive`) |
| `chat` | interna | pergunta/resposta com citações |
| `importer` | interna (8787) | `serve` + one-shot `seed`/`apply`/`verify` |
| `edge` | 127.0.0.1:8091 | wiki + `/chat/` + `/hooks/drive` + `/drive-image/` |
| `uploads` | 8080 | nginx legado de anexos antigos |

`.env` a partir de `.env.example` (nunca versionado). Conteúdo vem do Drive; `outlinedata` guarda só anexos/avatares.
