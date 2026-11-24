# import-drive — Drive → Outline + AnythingLLM

Lê Google Docs de um Drive compartilhado e escreve, independente e idempotente, no Outline e no AnythingLLM (`kb-drive`). Webhook (`changes.watch`) é o gatilho; `apply`/poll é o fallback. Contrato técnico em [`plans/contrato-importador.md`](../../plans/contrato-importador.md).

```powershell
cd src/import-drive
npm ci
npm run verify
node dist/src/cli.js seed     # carga inicial
node dist/src/cli.js apply    # incremental
node dist/src/cli.js verify   # convergência (exit 1 = divergência)
node dist/src/cli.js serve    # webhook + renovação + poll
```

Sem `DRIVE_WEBHOOK_URL` (HTTPS público) o `serve` roda em poll (`DRIVE_POLL_INTERVAL_MS`, 15 min).

## Imagens inline

O export HTML traz imagem como data URI; o importador troca por `/drive-image/<docId>/<objectId>` e o `serve` resolve o `contentUri` na Docs API (escopo `documents.readonly`, cache em memória de 20 min, nada em disco). Pré-requisito: Drive API + Docs API habilitadas. Doc fora do estado → 404; Docs API fora → 502. Fluxo em [`docs/architecture.md`](../../docs/architecture.md#imagens-inline).

## Env

Todas em `src/infra/.env.example`: `DRIVE_SA_KEY_PATH`, `DRIVE_ID`, `DRIVE_ROOT_FOLDER_ID`, `OUTLINE_API_URL`, `OUTLINE_API_KEY`, `OUTLINE_COLLECTION_MAP`, `OUTLINE_DEFAULT_COLLECTION_ID`, `ANYTHINGLLM_*`, `IMPORT_DRIVE_RAG_WORKSPACE`, `DRIVE_WEBHOOK_*`, `DRIVE_POLL_INTERVAL_MS`, `IMPORT_DRIVE_IGNORE_FOLDERS`, `IMPORTS_DB_PATH`, `OUTLINE_PUBLIC_URL`.

## Camadas

```
src/domain     normalize, images, hash (só stdlib)
src/ports      contratos (drive, docs, outline, rag, state)
src/usecases   importação, carga inicial, incremental, verify
src/commands   seed, apply, verify, serve
src/infra      config, logger, clients, state store, webhook
```

Gate: `npm run verify` (tsc + check-rules + testes, tudo com mock, nada de API real).
