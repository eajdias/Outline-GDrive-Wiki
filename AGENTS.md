# AGENTS.md — outline-gdrive-wiki

## Antes de mexer

1. Este arquivo.
2. [`docs/README.md`](docs/README.md) — índice; o conteúdo mora em `architecture.md`, `runbook.md`, `security.md` e `adr/`.
3. O `AGENTS.md` da área: `src/` (código), `src/infra/` (compose/env), `src/content/` (norma editorial), `docs/` (sincronia doc↔código).

## O que é verdade onde

- **Documentos: Google Drive.** Criação e edição acontecem lá. Nada de editar conteúdo via git.
- **Git versiona** infra, código, docs e planos. Conteúdo se cria no Drive, nunca via git.
- **IA 100% via API Gemini** (chat + embeddings). AnythingLLM é headless, só `/v1` com API key; chave nunca vai ao navegador.

## Regras

- Código, comentários e commits em inglês; conversa em PT-BR. Conventional commits, branches `feat/` e `fix/`.
- Segredo nunca versionado (`.env` fora do git, `600` no servidor).
- Sem barreira de segredo na v1 (uso em rede interna). Antes de expor o acervo para fora, reintroduzir a varredura bloqueante.
- Mostre a saída real do comando antes de dizer que terminou. Zero WARNING/ERROR em lint e compilador.
- Mudou comportamento, mudou o doc correspondente no mesmo commit. Em divergência, o código vence e a doc é corrigida junto.
- Contrato vem do código (`--help`, serviço rodando), não da memória.
- Não afirme o que não rodou. Arquivo novo só com consumidor real. Sem refatorar o entorno de carona.
- Cada regra mora num lugar só: código em `src/AGENTS.md`, infra em `src/infra/AGENTS.md`. Referencie, não repita.

## Produção

VPS Ubuntu, Docker Compose, TLS no edge, portas 22/80/443. Postgres, Redis e AnythingLLM só na rede interna. Backup diário do Postgres em `src/backups/`, com restore testado. Passo a passo em [`docs/runbook.md`](docs/runbook.md).
