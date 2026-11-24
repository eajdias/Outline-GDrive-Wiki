# Runbook

Comandos a partir da raiz do repo. Local: Windows + Docker Desktop. Produção: Ubuntu. O "porquê" de cada peça está em [`architecture.md`](architecture.md); aqui só o passo a passo.

## Subir e olhar

```powershell
docker compose -f src/infra/docker-compose.yml up -d
docker compose -f src/infra/docker-compose.yml ps
docker compose -f src/infra/docker-compose.yml logs -f outline
docker compose -f src/infra/docker-compose.yml down   # nunca down -v sem backup
```

- Wiki: http://127.0.0.1:8091 · chat: http://127.0.0.1:8091/chat/
- Acesso direto (sem edge): http://127.0.0.1:3000
- Wiki mostrando conteúdo velho é cache de aba: abra `/reset` e recarregue.

## Importador

```powershell
docker compose -f src/infra/docker-compose.yml run --rm --no-deps import-drive seed    # carga inicial
docker compose -f src/infra/docker-compose.yml run --rm --no-deps import-drive apply   # incremental
docker compose -f src/infra/docker-compose.yml run --rm --no-deps import-drive verify  # convergência (exit 1 = divergência)
docker compose -f src/infra/docker-compose.yml up -d import-drive                      # webhook + renovação + poll
```

- Webhook (`changes.watch` → `DRIVE_WEBHOOK_URL`) só chega em HTTPS público. Sem ele, o `serve` faz poll (`DRIVE_POLL_INTERVAL_MS`, 15 min) e o `apply` manual força.
- Canal do Drive dura no máximo 7 dias; o `serve` renova antes — estado em `GET /healthz`.
- Imagens exigem Drive API + Docs API habilitadas e SA com `drive.readonly` + `documents.readonly`.
- Só o token do importador escreve no Outline; consumidor tem leitura.

## Backup e restore

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File src/infra/scripts/backup-postgres.ps1
```

Gera dump em `src/backups/` e testa o restore num banco scratch, comparando a contagem de documentos vivos. Sem teste, o backup não conta. Restore testado todo mês.

Linux (produção):

```bash
docker compose -f src/infra/docker-compose.yml exec -T postgres pg_dump -U outline -Fc outline -f /tmp/outline-backup.dump
docker compose -f src/infra/docker-compose.yml cp postgres:/tmp/outline-backup.dump src/backups/outline-$(date +%Y%m%d-%H%M).dump
```

## Atualizar o Outline

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File src/infra/scripts/update-outline.ps1
```

Faz dump pré-update, `pull` da imagem, recria o serviço e aguarda health. Depois confira se a bolha do chat continua aparecendo — mudança de CSP quebra a injeção em silêncio.

## Login local sem magic link

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File src/infra/scripts/open-outline-session.ps1   # sessão de 3 meses
```

## Chat: limites e erros

Limites (de `src/infra/.env.example`): corpo 8 KB, 10 perguntas por janela/IP, pergunta até 1000 chars, corte `CHAT_MIN_SCORE` (0.65).

| Viu isso | Faça isso |
|---|---|
| RAG desatualizado | `verify`, depois `apply` |
| imagem 404/502 | Docs API ligada? escopo `documents.readonly`? doc no estado? |
| chat 413 / 429 | encurtar a pergunta / esperar a janela |
| chat sempre "não encontrei" | `verify`; ajustar `CHAT_MIN_SCORE` com evidência |
| bolha sumiu | snippet injetado? `script-src` no CSP? |
| 429/503 | backoff, conferir quota da Gemini |

Logs do chat:

```powershell
docker compose -f src/infra/docker-compose.yml up -d chatui edge
docker compose -f src/infra/docker-compose.yml logs --tail 100 chatui
```

## Trocar credencial

- `SECRET_KEY`/`UTILS_SECRET` e senha do Postgres: `.env` + restart.
- API key do AnythingLLM: gerar no AnythingLLM, atualizar no `.env` do chat e do importador.
- Chave Gemini: `update-env` do AnythingLLM.
- API key do Outline: Settings → API + `.env` do importador.
- Service account: nova chave no GCP + `DRIVE_SA_KEY_PATH`. Docs API: Console → Biblioteca → Ativar.

## Antes de cada release

`git grep` por segredo, `verify` do importador, `docker compose ps` tudo healthy, AnythingLLM sem porta exposta.
