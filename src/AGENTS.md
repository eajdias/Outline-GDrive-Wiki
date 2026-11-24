# AGENTS.md — src/

Regras de código para `apps/importer`, `apps/chat`, `packages/*` e scripts em `src/infra`.

## Stack

- **Node.js + TypeScript**, sem framework. Docker Compose na infra, Python só em `src/content/normalize`.
- Monorepo npm workspaces: `apps/*` (serviços), `packages/*` (compartilhado `@repo/*`). Nada de framework novo sem ADR em `docs/adr/`.

## Convenções

- Código, comentários e commits em inglês. Tipagem estrita, `any` implícito é erro.
- Config por env, nada hardcoded. `process.env` só em `infra/config.ts` via helpers de `@repo/env`. Logs em JSON com nível, serviço e operação; nunca segredo, `Authorization` ou corpo de auth.
- Erro de fronteira (HTTP, API externa) traduzido com o que fazer; erro interno propaga. Sem `catch` silencioso.
- Compartilhado vive em `packages/*`: env, logger, http, config TS. Serviço importa `@repo/*`, nunca copia.

## Camadas (só `apps/*`)

`domain/` (regra pura, só stdlib) → `ports/` (contrato de I/O) → `usecases/` (orquestra) → `commands/` (um caso por arquivo) → `infra/` (config, clients, composition root em `index.ts` ou `context.ts`).

Falha o gate: `domain` importando outra camada; `process.env` fora de `infra/config.ts`; `console.*` fora de `@repo/logger`; `export default`, `any`, `require()`, `catch` vazio, `TODO`/`FIXME`.

## Tamanho

- Arquivo de produção ≤ 250 linhas, teste ≤ 400. Classe ≤ 8 métodos públicos.
- Sem `utils`/`helpers` genérico, sem wrapper de repasse, sem flag que muda tudo, sem comentário que repete o código. Menor mudança que resolve; DRY só a partir do terceiro uso real.

Verificação: `npm run verify` na raiz (tsc + `check-rules.mjs` + `node --test` por workspace). Regra nova entra no script.

## Testes

- Unitário de regra pura; integração contra mock (Drive, Outline, AnythingLLM). **Nunca** Gemini ou API real em teste.
- Gate é `verify` + pergunta real no `/ask`; o `eval` top-3 do RAG fica para depois do aceite.

## Pronto

`npm run verify` verde, sem segredo em código/fixture/log, variável nova no `.env.example`, comportamento novo em `docs/`.
