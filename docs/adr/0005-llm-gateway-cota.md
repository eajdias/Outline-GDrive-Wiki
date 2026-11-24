# ADR 0005 — Cota do LLM: gateway próprio com rotação de chaves e provedores

**Status:** aceito

## Decisão

- O AnythingLLM **não fala mais direto** com o Gemini: `LLM_PROVIDER`/`EMBEDDING_ENGINE` = `generic-openai` apontando para o `llm-gateway` (rede interna, sem porta publicada). As chaves do provedor vivem só no gateway; o AnythingLLM autentica com `LLM_GATEWAY_TOKEN`.
- O gateway é próprio (`apps/llm-gateway`), sobre `node:http` e `fetch`, sem SDK — mesmo padrão do resto do repo.
- Política de fallback, em dois níveis: no `429` (cota/rate limit) a chave entra em cooldown (`LLM_GATEWAY_KEY_COOLDOWN_MS`, 15 min) e a próxima assume; quando todas as chaves de um provedor esgotam, desce para o próximo de `LLM_GATEWAY_PROVIDERS`. Qualquer status que não seja `429` volta ao chamador sem retry (não duplica escrita).
- O gateway reescreve `model` e `dimensions` para manter o vetor do LanceDB no tamanho configurado (`EMBEDDING_OUTPUT_DIMENSIONS`), independente de qual conta atendeu.

## Consequências

- Somar cotas gratuitas de várias contas é configuração (`GEMINI_API_KEYS`), não código. Cota nova = acrescentar chave e recriar o gateway.
- O cooldown vive em memória: reiniciar o gateway libera todas as chaves (inclusive as que ainda estão sem cota). Aceitável porque o estado é só de performance, não de correção.
- Um ponto de falha novo no caminho do chat. Mitigado por healthcheck, `depends_on: service_healthy` e fallback em memória do próprio AnythingLLM; se o gateway cair, `/ask` degrada para "não encontrei" em vez de servir sem fonte.
- Trocar de provedor (OpenRouter, Groq, LM Studio, etc.) exige só uma entrada OpenAI-compatível em `LLM_GATEWAY_PROVIDERS` + `GENERIC_*`; o contrato com o AnythingLLM não muda.
