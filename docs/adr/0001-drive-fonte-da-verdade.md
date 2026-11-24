# ADR 0001 — Drive como fonte da verdade; Outline só-leitura; webhook do Drive

**Status:** aceito

## Decisão

- **Fonte da verdade = Google Drive.** Criação e edição acontecem exclusivamente nos Google Docs das pastas espelhadas. O Outline guarda cópia de leitura (coleções só-leitura, sem write-back).
- **Importação = importer** (`apps/importer`): alimenta Outline e AnythingLLM de forma independente e idempotente (hash do conteúdo). Só Google Docs entram; pastas ignoradas e coleção default via env (`IMPORT_DRIVE_IGNORE_FOLDERS`, `OUTLINE_DEFAULT_COLLECTION_ID`).
- **Gatilho primário = push notification do Drive** (`changes.watch` → `POST /hooks/drive`, debounce). Fallback = `apply`/poll (`DRIVE_POLL_INTERVAL_MS`); o webhook só funciona com HTTPS público.
- **Imagens inline via Docs API:** o importador reescreve cada `<img>` para `/drive-image/<docId>/<objectId>`; o `serve` resolve o `contentUri` na Google Docs API (escopo `documents.readonly`) com cache em memória. O edge publica a rota; só `docId` no estado é servido.
- **Outline somente leitura por política** (não trava técnica por documento): o token do importador é o único escrevente; consumidores recebem leitura.
- **Sem barreira de segredo na v1** (uso em rede interna): reavaliar antes de qualquer exposição externa do acervo.

## Consequências

- Uma aba antiga do navegador pode mostrar estado anterior (a SPA mantém dados em memória): feche as abas ou limpe o site data.
- Pasta/coleção nova exige mapeamento em `OUTLINE_COLLECTION_MAP` (ou resolução por nome) antes do próximo `apply`.
- O canal do Drive expira em no máximo 7 dias: o `serve` renova antes do vencimento; `verify` com alerta cobre a rede de segurança.
