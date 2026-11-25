# Contribuindo

## Antes de codar

1. Leia [`src/AGENTS.md`](../src/AGENTS.md) (regras de código) e [`docs/README.md`](README.md) (mapa da doc).
2. Suba o stack local com [`setup.md`](setup.md) — você vai precisar de Drive + Gemini reais para teste fim a fim (testes automatizados usam mock).

## Fluxo

1. Branch a partir de `main`: `feat/<o-que>` para feature, `fix/<o-que>` para bug.
2. `npm run verify` na raiz antes de abrir PR — gate: build dos pacotes `@repo/*` em ordem de dependência, `tsc` + `check-rules.mjs` + `node --test` em todos os workspaces. Sem WARNING/ERROR.
3. Mudou comportamento, mudou o doc correspondente **no mesmo commit** (regra do repo: código vence a doc em divergência, e a doc é corrigida junto).
4. Commits em inglês, conventional commits (`feat:`, `fix:`, `docs:`, `chore:`), com trailer:

```
Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
```

5. PR com: o que mudou, como testar (`seed`/`verify`/pergunta no `/ask` com evidência), e saída real dos comandos.

## Regras que mais pegam

- Código, comentários e commits em **inglês**; conversa em PT-BR.
- `process.env` só em `infra/config.ts` via `@repo/env`. `console.*` só em `@repo/logger`.
- Sem `export default`, sem `any`, sem `require()`, sem `catch` vazio, sem `TODO`.
- Camadas: `domain → ports → usecases → (commands) → infra`. `domain` nunca importa outra camada.
- Compartilhado vive em `packages/*` (`@repo/env`, `@repo/logger`, `@repo/http`). Serviço importa, nunca copia.
- Teste com mock (Drive, Outline, AnythingLLM). **Nunca** Gemini ou API real em teste.
- Arquivo novo só com consumidor real. Sem refatorar o entorno de carona.
- Nada de segredo em código, fixture, log ou doc. `git grep -i "apikey\|secret\|token" -- ':!*.md'` deve voltar limpo (fora `.env.example` com placeholders).

## Testando sua mudança

```bash
npm run verify                                   # tudo
npm run verify --workspace=@kb/chat             # só o chat
npm run verify --workspace=@kb/importer         # só o importer
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer verify
# + uma pergunta real no /ask com as fontes citadas
```

## Reportando bug

Abra issue com: comando exato, saída real (cole o log, sem segredo), `.env` sanitizado (só nomes das vars, sem valores), e o que `verify` reportou.
