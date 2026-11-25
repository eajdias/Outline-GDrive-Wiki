# Runbook — operação diária

How-tos para quem já subiu o stack ([`setup.md`](setup.md)). Cada seção resolve um problema; comandos idênticos no Windows (PowerShell 7) e no Linux, exceto onde indicado.

## Deploy (subir/atualizar o stack)

Um comando, idempotente — re-rodar é seguro (valida, backup, sobe com health-gate):

Windows:

```powershell
src/infra/deploy.ps1                    # interativo (pergunta antes do backup)
src/infra/deploy.ps1 -Yes -NoBackup    # CI / sem backup
```

Linux:

```bash
chmod +x src/infra/deploy.sh
./src/infra/deploy.sh                  # interativo (pergunta antes do backup)
./src/infra/deploy.sh --yes --no-backup  # CI / sem backup
```

Fases: preflight → env-validate (falha rápido sem expor valores) → backup → pull/build → `up -d --wait` (health-gate 300s) → resumo com URLs. Host dedicado: `DEPLOY_ENV=prod ./src/infra/deploy.sh` (overlay sem portas diretas + TLS no edge). Host compartilhado (80/443 já ocupados pelo nginx do host): `DEPLOY_ENV=vps ./src/infra/deploy.sh` (overlay sem portas diretas, edge segue em 127.0.0.1:8091) + vhost do host (ver abaixo). Flags: `--env-file PATH`, `--timeout SECS`, `--pull`/`--no-pull`.

Em falha no health-gate, os containers ficam de pé para diagnóstico (`ps` + últimos 100 logs impressos) — nunca apague volumes (`down -v`) como "correção".

## Ver saúde da stack

```bash
docker compose -f src/infra/docker-compose.yml ps          # tudo healthy?
docker compose -f src/infra/docker-compose.yml logs -f outline
```

- Wiki: http://127.0.0.1:8091 · chat: http://127.0.0.1:8091/chat/ · direto: http://127.0.0.1:3000
- Wiki com conteúdo velho = cache de aba: abra `/reset` e recarregue.
- Host dedicado: adicione `-f src/infra/docker-compose.prod.yml` (sem portas diretas, TLS no edge; exige `src/infra/certs/` + `OUTLINE_PUBLIC_URL`).
- Host compartilhado: adicione `-f src/infra/docker-compose.vps.yml` (ou `DEPLOY_ENV=vps`) e exponha via reverse proxy do host com `src/infra/host-nginx/wiki.conf.example` (TLS no host; `URL`, `OUTLINE_PUBLIC_URL` e `CHAT_PUBLIC_URL` apontam para `https://<dominio>`).

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
| chat 401 (UI ou `/ask`) | sessão do Outline ausente/expirada; `/healthz` é público. Com sessão ativa, confira `OUTLINE_AUTH_URL` do chat |
| chat 413 / 429 | encurtar a pergunta / esperar a janela (Redis compartilhado entre réplicas) |
| chat sempre "não encontrei" | `verify`; ajustar `CHAT_MIN_SCORE` com evidência |
| bolha sumiu | snippet injetado? `script-src` no CSP? |
| 429/503 | cota esgotada em todas as chaves — ver seção abaixo |

### Cota do LLM (llm-gateway)

O gateway troca de chave sozinho no `429` e volta a ela após `LLM_GATEWAY_KEY_COOLDOWN_MS` (15 min). Estado atual:

```bash
docker compose -f src/infra/docker-compose.yml exec -T llm-gateway wget -qO- http://127.0.0.1:8090/healthz
# {"status":"ok","upstreams":[{"name":"gemini","keys":{"total":3,"cooling":1,"nextRetryMs":420000}}]}
```

Log de cada request traz `upstream`, `keyIndex` e `status`:

```bash
docker compose -f src/infra/docker-compose.yml logs --tail 100 llm-gateway
```

Acabaram as chaves? Acrescente outra conta em `GEMINI_API_KEYS` e recrie só o gateway:

```bash
docker compose -f src/infra/docker-compose.yml up -d llm-gateway
```

Reiniciar o gateway zera os cooldowns (estado em memória).

### 443 sem responder (host dedicado)

O overlay de produção usa `edge/nginx.tls.conf`. Se o edge não sobe, faltam os certificados:

```bash
ls -l src/infra/certs/fullchain.pem src/infra/certs/privkey.pem
docker compose -f src/infra/docker-compose.yml -f src/infra/docker-compose.prod.yml logs --tail 50 edge
```

```bash
docker compose -f src/infra/docker-compose.yml up -d chat edge
docker compose -f src/infra/docker-compose.yml logs --tail 100 chat
```

Limites em `src/infra/.env.example`: corpo 8 KB, 10 perguntas/janela/IP, pergunta ≤1000 chars, corte `CHAT_MIN_SCORE` (0.65).

## Reverse proxy do host (VPS compartilhada)

Quando 80/443 já pertencem ao nginx do host, o edge nunca binda essas portas: o modo `vps` mantém o edge em 127.0.0.1:8091 e o host termina o TLS:

```bash
sudo cp src/infra/host-nginx/wiki.conf.example /etc/nginx/sites-enabled/wiki.conf
sudo sed -i "s/wiki.exemplo.com/<dominio-real>/" /etc/nginx/sites-enabled/wiki.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <dominio-real>
```

No `.env`: `URL`, `OUTLINE_PUBLIC_URL` e `CHAT_PUBLIC_URL` apontam para `https://<dominio-real>` (trocar `OUTLINE_PUBLIC_URL` reindexa as citações no próximo `seed`). Deploy: `DEPLOY_ENV=vps ./src/infra/deploy.sh`.

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

## Release (gerar o tarball transportável)

`src/infra/release.sh` empacota a fonte versionada — o build acontece no alvo:

```bash
./src/infra/release.sh 0.3.0   # exige repo limpo; sai em dist/outline-gdrive-wiki-0.3.0.tar.gz
```

O bundle leva `apps packages src docs scripts README LICENSE package*.json` + `MANIFEST.json` — sem `node_modules`, `dist`, `.env` ou segredos, e vem com `.sha256` para conferência. Na VPS: extrair, `cp .env.example .env`, preencher segredos ([`setup.md`](setup.md#3-preencher-o-env)), rodar `./src/infra/deploy.sh`.

## Atualizar o Outline

Windows: `pwsh -NoProfile -ExecutionPolicy Bypass -File src/infra/scripts/update-outline.ps1`
Linux: `chmod +x src/infra/scripts/update-outline.sh && ./src/infra/scripts/update-outline.sh [--skip-backup]`

Dump pré-update + `pull` + recreate + wait health. Depois confira a bolha do chat (CSP quebra a injeção em silêncio). Agendar no Windows: importe `register-outline-auto-update.ps1` no Task Scheduler (`-Time '03:00'`).

## Entrar sem magic link

Windows: `pwsh ... -File src/infra/scripts/open-outline-session.ps1` · Linux: `./src/infra/scripts/open-outline-session.sh [email]` (sessão de 3 meses).

## Trocar credencial

- `SECRET_KEY`/`UTILS_SECRET`, senha do Postgres: `.env` + restart.
- API key do AnythingLLM: gere de novo (ver [`setup.md`](setup.md#4-primeiro-boot--chaves-geradas-pelos-serviços)), atualize `.env`.
- Chaves Gemini: edite `GEMINI_API_KEYS` (lista separada por vírgula) e recrie o gateway. Revogar uma conta = remover da lista.
- API key do Outline: Settings → API + `.env`.
- Service account: nova chave no GCP + `DRIVE_SA_KEY_PATH`.

## Antes de cada release

`git grep` por segredo, `importer verify`, `docker compose ps` tudo healthy, AnythingLLM sem porta exposta.
