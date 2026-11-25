# chat — pergunta/resposta com citações

Backend Node/TS sem framework sobre `/v1/workspace/<slug>/chat` do AnythingLLM. Devolve `answer` + `sources[]` (link + score) e `notFound` abaixo do corte. A API key fica só no backend.

```bash
npm run verify --workspace=@kb/chat   # tsc + check-rules + node --test (sem Gemini real)
ANYTHINGLLM_API_URL=http://localhost:3002 ANYTHINGLLM_API_KEY=<chave> ANYTHINGLLM_WORKSPACES=kb-drive npm start --workspace=@kb/chat
```

`POST /ask { "question": "..." }` → `{ answer, notFound, sources[] }`. Toda rota exceto `GET /healthz` exige sessão válida do Outline: o cookie `accessToken` é validado em `POST ${OUTLINE_AUTH_URL}/api/auth.info` (default `http://outline:3000`). Erros: 401 sem sessão, 400 pergunta inválida, 413 corpo grande, 429 rate limit, 502/503/504 falha do AnythingLLM.

O edge injeta `widget.js` no wiki (`CHAT_ALLOW_EMBED=1` libera o iframe `?embed=1`); o snippet manual serve para páginas fora do wiki. Limites e diagnóstico em [`docs/runbook.md`](../../docs/runbook.md#chat-limites-e-erros); env e limites em `src/infra/.env.example` (`CHAT_*`, `ANYTHINGLLM_*`).
