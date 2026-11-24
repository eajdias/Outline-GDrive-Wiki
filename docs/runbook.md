# Runbook

Comandos a partir da raiz do repo. Funciona igual no Windows (PowerShell 7) e no Linux (CachyOS, Ubuntu); onde diverge, há bloco para cada um. O "porquê" de cada peça está em [`architecture.md`](architecture.md); aqui só o passo a passo.

## Subir e olhar

```bash
docker compose -f src/infra/docker-compose.yml up -d
docker compose -f src/infra/docker-compose.yml ps
docker compose -f src/infra/docker-compose.yml logs -f outline
docker compose -f src/infra/docker-compose.yml down   # nunca down -v sem backup
```

- Wiki: http://127.0.0.1:8091 · chat: http://127.0.0.1:8091/chat/
- Acesso direto (sem edge): http://127.0.0.1:3000
- Wiki mostrando conteúdo velho é cache de aba: abra `/reset` e recarregue.

Produção (overlay, sem portas de acesso direto, TLS no edge):

```bash
docker compose -f src/infra/docker-compose.yml -f src/infra/docker-compose.prod.yml up -d
```

Pré-requisitos no host: `./certs/fullchain.pem` + `./certs/privkey.pem` em `src/infra/certs/` e `OUTLINE_PUBLIC_URL` com o domínio público.

## Importador

```bash
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer seed    # carga inicial
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer apply   # incremental
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer verify  # convergência (exit 1 = divergência)
docker compose -f src/infra/docker-compose.yml up -d importer                      # webhook + renovação + poll
```

- Webhook (`changes.watch` → `DRIVE_WEBHOOK_URL`) só chega em HTTPS público. Sem ele, o `serve` faz poll (`DRIVE_POLL_INTERVAL_MS`, 15 min) e o `apply` manual força.
- Canal do Drive dura no máximo 7 dias; o `serve` renova antes — estado em `GET /healthz`.
- Imagens exigem Drive API + Docs API habilitadas e SA com `drive.readonly` + `documents.readonly`.
- Só o token do importador escreve no Outline; consumidor tem leitura.

## Backup e restore

Backup diário via timer do host (systemd, Linux). Instalação (uma vez, no servidor):

```bash
sudo cp src/infra/systemd/backup.service src/infra/systemd/backup.timer /etc/systemd/system/
sudo sed -i "s|/srv/outline-gdrive-wiki|$(pwd)|" /etc/systemd/system/backup.service
sudo systemctl daemon-reload && sudo systemctl enable --now backup.timer
systemctl list-timers backup.timer   # confirma o agendamento
```

Manual (fora do timer, qualquer SO):

```bash
docker compose -f src/infra/docker-compose.yml run --rm backup
```

Gera em `src/backups/`: `pg-<data>.dump` (Postgres `-Fc`, inclui o estado do importador), `globals-<data>.sql.gz` (roles) e `files-<data>.tgz` (Redis AOF, uploads do Outline, storage do AnythingLLM). O script valida (`pg_restore --list`, `gunzip -t`, `tar -tzf`) e retém os últimos `BACKUP_KEEP_DAILY` (default 7). Sem validação, o backup não conta. Copie para fora do disco (S3/rclone) — mesmo disco não é backup.

Windows (dev local, sem systemd): o equivalente é `src/infra/scripts/backup-postgres.ps1` (só Postgres; produção usa o job `backup` acima).

Restore testado todo mês num banco scratch:

```bash
docker compose -f src/infra/docker-compose.yml exec -T postgres psql -U outline -d postgres -c "CREATE DATABASE restore_test;"
docker compose -f src/infra/docker-compose.yml exec -T postgres pg_restore -U outline -d restore_test --no-owner /backups/pg-<data>.dump
```

## Convergência diária

O `verify` roda todo dia via timer (mesma instalação do backup, com `verify.service`/`verify.timer`). Divergência aparece no journal:

```bash
sudo journalctl -u verify.service --since "24h ago" | tail -20
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer verify
```

## Atualizar o Outline

Windows:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File src/infra/scripts/update-outline.ps1
```

Linux:

```bash
chmod +x src/infra/scripts/update-outline.sh
./src/infra/scripts/update-outline.sh            # ou ./src/infra/scripts/update-outline.sh --skip-backup
```

Faz dump pré-update, `pull` da imagem, recria o serviço e aguarda health. Depois confira se a bolha do chat continua aparecendo — mudança de CSP quebra a injeção em silêncio.

Agendamento diário no Windows (equivale ao timer systemd): `Task Scheduler` → importe `src/infra/scripts/register-outline-auto-update.ps1` (rode com `-Time '03:00'`).

## Login local sem magic link

Windows:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File src/infra/scripts/open-outline-session.ps1   # sessão de 3 meses
```

Linux:

```bash
chmod +x src/infra/scripts/open-outline-session.sh
./src/infra/scripts/open-outline-session.sh [email]   # imprime a URL (abre sozinho se houver xdg-open)
```

## Chat: limites e erros

Limites (de `src/infra/.env.example`): corpo 8 KB, 10 perguntas por janela/IP (Redis compartilhado, vale para todas as réplicas), pergunta até 1000 chars, corte `CHAT_MIN_SCORE` (0.65).

| Viu isso | Faça isso |
|---|---|
| RAG desatualizado | `verify`, depois `apply` |
| imagem 404/502 | Docs API ligada? escopo `documents.readonly`? doc no estado? |
| chat 413 / 429 | encurtar a pergunta / esperar a janela |
| chat sempre "não encontrei" | `verify`; ajustar `CHAT_MIN_SCORE` com evidência |
| bolha sumiu | snippet injetado? `script-src` no CSP? |
| 429/503 | backoff, conferir quota da Gemini |

Logs do chat:

```bash
docker compose -f src/infra/docker-compose.yml up -d chat edge
docker compose -f src/infra/docker-compose.yml logs --tail 100 chat
```

## Trocar credencial

- `SECRET_KEY`/`UTILS_SECRET` e senha do Postgres: `.env` + restart.
- API key do AnythingLLM: gerar no AnythingLLM, atualizar no `.env` do chat e do importador.
- Chave Gemini: `update-env` do AnythingLLM.
- API key do Outline: Settings → API + `.env` do importador.
- Service account: nova chave no GCP + `DRIVE_SA_KEY_PATH`. Docs API: Console → Biblioteca → Ativar.

## Antes de cada release

`git grep` por segredo, `verify` do importador, `docker compose ps` tudo healthy, AnythingLLM sem porta exposta.
