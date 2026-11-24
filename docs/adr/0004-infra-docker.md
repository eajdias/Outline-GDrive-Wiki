# ADR 0004 — Infra: Docker Compose, storage local, backup local, VPS

**Status:** aceito (2026-11-17)

## Decisão

- Stack em **Docker Compose** (projeto `outline-gdrive-wiki`, rede `kb-net`): `outline`, `postgres`, `redis`, `uploads` (legado), `anythingllm`, `chatui`, `import-drive`, `edge`. Postgres, Redis, AnythingLLM, chatui e import-drive **nunca publicam porta** no host.
- **Storage do Outline = `local`** (volume `outlinedata`), apenas para anexos/avatares. O conteúdo vem do Drive; o Outline não aceita Drive como backend. S3/AWS **não são usados**.
- **Backup = `pg_dump -Fc` → `src/backups/` (local)**, com restore testado em banco scratch. Sem nuvem.
- VPS mínima: **2 vCPU / 4 GB RAM / 40 GB SSD** (medido em ocioso: Outline 216 MiB, Postgres 45 MiB, Redis 12 MiB, AnythingLLM 325 MiB ≈ 600 MiB). Build fora da VPS; na VPS apenas `pull`.

## Consequências

- Sem `down -v` sem dump verificado — apaga o banco.
- S3 só volta como proposta nova, se um dia houver necessidade de storage nativo de arquivo.
