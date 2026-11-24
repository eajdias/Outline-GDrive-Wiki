# Runbook — operação diária

How-tos para quem já subiu o stack ([`setup.md`](setup.md)). Cada seção resolve um problema; comandos idênticos no Windows (PowerShell 7) e no Linux, exceto onde indicado.

## Ver saúde da stack

```bash
docker compose -f src/infra/docker-compose.yml ps          # tudo healthy?
docker compose -f src/infra/docker-compose.yml logs -f outline
```

- Wiki: http://127.0.0.1:8091 · chat: http://127.0.0.1:8091/chat/ · direto: http://127.0.0.1:3000
- Wiki com conteúdo velho = cache de aba: abra `/reset` e recarregue.
- Produção: adicione `-f src/infra/docker-compose.prod.yml` (sem portas diretas, TLS no edge; exige `src/infra/certs/` + `OUTLINE_PUBLIC_URL`).

## Sincronizar o Drive

```bash
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer apply   # incremental
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer verify  # exit 1 = divergência
docker compose -f src/infra/docker-compose.yml up -d importer                      # serve contínuo
```

Webhook só chega com HTTPS público (`DRIVE_WEBHOOK_URL`); sem ele, poll a cada 15 min + `apply` manual. Canal expira em ≤7 dias — o `serve` renova sozinho (`GET /healthz` mostra o estado). Só o token do importador escreve no Outline.

## Diagnosticar o chat

| Viu isso | Faça isso |
|---|---|
| RAG desatualizado | `verify`, depois `apply` |
| imagem 404/502 | Docs API ligada? escopo `documents.readonly`? doc no estado? |
| chat 413 / 429 | encurtar a pergunta / esperar a janela (Redis compartilhado entre réplicas) |
| chat sempre "não encontrei" | `verify`; ajustar `CHAT_MIN_SCORE` com evidência |
| bolha sumiu | snippet injetado? `script-src` no CSP? |
| 429/503 | backoff, conferir quota da Gemini |

```bash
docker compose -f src/infra/docker-compose.yml up -d chat edge
docker compose -f src/infra/docker-compose.yml logs --tail 100 chat
```

Limites em `src/infra/.env.example`: corpo 8 KB, 10 perguntas/janela/IP, pergunta ≤1000 chars, corte `CHAT_MIN_SCORE` (0.65).

## Backup e restore

Timer do host (systemd, Linux), uma vez no servidor:

```bash
sudo cp src/infra/systemd/backup.service src/infra/systemd/backup.timer /etc/systemd/system/
sudo sed -i "s|/srv/outline-gdrive-wiki|$(pwd)|" /etc/systemd/system/backup.service
sudo systemctl daemon-reload && sudo systemctl enable --now backup.timer
systemctl list-timers backup.timer
```

Manual (qualquer SO): `docker compose -f src/infra/docker-compose.yml run --rm backup` — gera `pg-<data>.dump` (+ globals + arquivos) em `src/backups/`, valida e retém 7 dias. Copie para fora do disco. Windows sem systemd: `src/infra/scripts/backup-postgres.ps1` (só Postgres).

Restore mensal num banco scratch:

```bash
docker compose -f src/infra/docker-compose.yml exec -T postgres psql -U outline -d postgres -c "CREATE DATABASE restore_test;"
docker compose -f src/infra/docker-compose.yml exec -T postgres pg_restore -U outline -d restore_test --no-owner /backups/pg-<data>.dump
```

## Ver convergência todo dia

Timer `verify.service`/`verify.timer` (instala igual ao backup). Divergência no journal:

```bash
sudo journalctl -u verify.service --since "24h ago" | tail -20
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer verify
```

## Atualizar o Outline

Windows: `pwsh -NoProfile -ExecutionPolicy Bypass -File src/infra/scripts/update-outline.ps1`
Linux: `chmod +x src/infra/scripts/update-outline.sh && ./src/infra/scripts/update-outline.sh [--skip-backup]`

Dump pré-update + `pull` + recreate + wait health. Depois confira a bolha do chat (CSP quebra a injeção em silêncio). Agendar no Windows: importe `register-outline-auto-update.ps1` no Task Scheduler (`-Time '03:00'`).

## Entrar sem magic link

Windows: `pwsh ... -File src/infra/scripts/open-outline-session.ps1` · Linux: `./src/infra/scripts/open-outline-session.sh [email]` (sessão de 3 meses).

## Trocar credencial

- `SECRET_KEY`/`UTILS_SECRET`, senha do Postgres: `.env` + restart.
- API key do AnythingLLM: gere de novo (ver [`setup.md`](setup.md#4-primeiro-boot--chaves-geradas-pelos-serviços)), atualize `.env`.
- Chave Gemini: `update-env` do AnythingLLM.
- API key do Outline: Settings → API + `.env`.
- Service account: nova chave no GCP + `DRIVE_SA_KEY_PATH`.

## Antes de cada release

`git grep` por segredo, `importer verify`, `docker compose ps` tudo healthy, AnythingLLM sem porta exposta.
