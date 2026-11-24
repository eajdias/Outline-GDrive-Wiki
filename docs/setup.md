# Setup — do zero ao wiki com chat

Tutorial: saia do repo clonado para o wiki carregado e o chat respondendo com fontes. Siga na ordem, sem pular passos. Tempo estimado: ~30 min (a maior parte esperando `pull` e `seed`).

Pré-requisitos: Docker (Desktop no Windows, Engine no Linux), Node 24+, `openssl`, uma conta Google com acesso ao Drive, e uma chave Gemini ([AI Studio](https://aistudio.google.com/apikey)).

> Convenção: blocos `powershell` rodam no Windows (PowerShell 7), blocos `bash` no Linux (CachyOS, Ubuntu ou qualquer distro). Comandos `docker compose` são idênticos nos dois.

## 1. Google Cloud: service account + APIs

Tudo no [Console GCP](https://console.cloud.google.com/) (um projeto qualquer serve):

1. **APIs e serviços → Biblioteca**: ative **Google Drive API** e **Google Docs API** (se desativadas, o importador falha com 403 e as imagens dão 502).
2. **IAM e admin → Contas de serviço → Criar**: nome qualquer (ex. `kb-importer`). Sem papel no projeto — ela só precisa ser leitora do Drive.
3. Na conta criada: **Chaves → Adicionar chave → JSON**. Baixe e guarde **fora do repo**:
   - Linux: `~/.secrets/kb/drive-sa.json` (`chmod 600`)
   - Windows: `%USERPROFILE%\.secrets\kb\drive-sa.json`
4. No Drive: compartilhe a pasta raiz (ou o Drive compartilhado) com o e-mail da service account (`xxx@projeto.iam.gserviceaccount.com`) como **Leitor**.

Anote: caminho do JSON, ID da pasta raiz e (se Drive compartilhado) ID do Drive. Os IDs aparecem na URL do Drive (`.../folders/<ID>`) ou via API.

Escopos usados (somente leitura, nunca escrita no Drive): `drive.readonly` + `documents.readonly`.

## 2. Chaves Gemini (quantas quiser)

1. [Google AI Studio → API keys](https://aistudio.google.com/apikey) → **Create API key**. Uma chave serve para chat **e** embeddings.
2. Repita em outras contas Google e junte as chaves em `GEMINI_API_KEYS` (separadas por vírgula, ordem de preferência). O `llm-gateway` alterna entre elas quando uma bate no limite de cota — é assim que várias cotas gratuitas somam.
3. Guarde: a cota é por conta; em produção com muito embed, acompanhe em [AI Studio → Usage](https://aistudio.google.com/) (429/503 no chat quase sempre é cota).

## 3. Preencher o `.env`

Windows:

```powershell
Copy-Item src/infra/.env.example src/infra/.env
```

Linux:

```bash
cp src/infra/.env.example src/infra/.env
chmod 600 src/infra/.env
```

Preencha nesta ordem (só o que tem `=` vazio precisa de você; o resto já vem com default funcional):

| Variável | De onde tirar | Exemplo |
|---|---|---|
| `SECRET_KEY`, `UTILS_SECRET` | `openssl rand -hex 32` (um por linha) | `9f2c…` (64 hex) |
| `POSTGRES_PASSWORD` | invente uma senha forte local | — |
| `GEMINI_API_KEYS` | passo 2, uma ou mais chaves separadas por vírgula | `AIza-conta1,AIza-conta2` |
| `LLM_GATEWAY_TOKEN` | `openssl rand -hex 32` (autentica o gateway internamente) | — |
| `ANYTHINGLLM_JWT_SECRET`, `ANYTHINGLLM_AUTH_TOKEN` | `openssl rand -hex 32` cada | — |
| `ANYTHINGLLM_API_KEY` | **depois do primeiro boot** (passo 4) | `…` |
| `DRIVE_SA_KEY_PATH` | caminho do JSON do passo 1 (no host) | Linux `~/.secrets/kb/drive-sa.json` · Win `%USERPROFILE%\.secrets\kb\drive-sa.json` |
| `DRIVE_ID` | ID do Drive compartilhado (vazio = Meu Drive) | `0AB…` |
| `DRIVE_ROOT_FOLDER_ID` | ID da pasta raiz espelhada | `1AB…` |
| `OUTLINE_API_KEY` | **depois do primeiro boot** (passo 4) | `ol_api_…` |
| `OUTLINE_DEFAULT_COLLECTION_ID` | idem (passo 4, opcional) | `b5d…` |
| `DRIVE_WEBHOOK_URL` | só produção com HTTPS (ex. `https://wiki.exemplo.com.br/hooks/drive`); vazio = poll a cada 15 min | — |
| `DRIVE_WEBHOOK_TOKEN` | obrigatório se usar webhook (sem ele o importador recusa toda notificação) | — |
| `STATE_DATABASE_URL` | já vem montado com `POSTGRES_*`; só ajuste se mudar o banco | `postgres://outline:…@postgres:5432/outline` |

Não mexa (a menos que saiba por quê): URLs internas (`OUTLINE_API_URL`, `ANYTHINGLLM_API_URL`, `REDIS_URL`, `GENERIC_OPEN_AI_BASE_PATH`), portas, `*_MS`, `IMPORT_CONCURRENCY`, `CHAT_*` (limites), `LLM_GATEWAY_*` (política de cota), `EMBEDDING_OUTPUT_DIMENSIONS` (depois do seed), `OUTLINE_PUBLIC_URL` (só produção).

## 4. Primeiro boot + chaves geradas pelos serviços

```bash
docker compose -f src/infra/docker-compose.yml up -d
docker compose -f src/infra/docker-compose.yml ps   # tudo healthy
```

O `llm-gateway` precisa de `GEMINI_API_KEYS` (ou `GEMINI_API_KEY`) e recusa subir sem ela; o AnythingLLM espera o gateway ficar `healthy`.

Agora gere as duas chaves que só existem depois do boot:

**AnythingLLM API key:**

```bash
docker compose -f src/infra/docker-compose.yml run --rm --no-deps anythingllm curl -s -X POST http://anythingllm:3001/api/request-token
# → {"token":"..."}  (use nas chamadas abaixo como $BOOT)

docker compose -f src/infra/docker-compose.yml run --rm --no-deps anythingllm curl -s -X POST http://anythingllm:3001/api/admin/generate-api-key -H "Authorization: Bearer $BOOT"
# → {"apiKey":"..."}  → cole em ANYTHINGLLM_API_KEY
```

> Atalho local: o AnythingLLM também aceita criar a key pela UI se você publicar a porta temporariamente (`ports: ["3001:3001"]` + `up`, crie em Settings → API, depois remova a porta). Nunca deixe essa porta publicada em produção.

**Outline API key + coleção default:**

1. Crie seu usuário admin: abra http://127.0.0.1:8091, cadastre-se (primeiro usuário vira admin).
2. Settings → API → **Create API key** (escopo leitura+escrita) → cole em `OUTLINE_API_KEY`.
3. Crie as coleções espelhando as pastas do Drive (mesmo nome) **ou** preencha `OUTLINE_COLLECTION_MAP` (`{"<folderId>":"<collectionId>"}`) — IDs em Settings → API → Collections ou na URL da coleção.
4. (Opcional) Coleção de fallback em `OUTLINE_DEFAULT_COLLECTION_ID` (ex. `Geral`).

Depois de preencher: `docker compose -f src/infra/docker-compose.yml up -d` (recreate pega o `.env` novo).

## 5. Carga inicial + convergência

```bash
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer seed    # lista tudo, converte, escreve nos 2 destinos
docker compose -f src/infra/docker-compose.yml run --rm --no-deps importer verify  # exit 0 = Drive = estado = workspace
```

`seed` em acervo grande demora (`IMPORT_CONCURRENCY=4` paraleliza). Acompanhe com `logs -f importer`. Doc com falha vai para `dead_letters` sem travar o resto.

## 6. Checagem fim a fim (feito = tutorial completo)

1. Wiki: http://127.0.0.1:8091 — documentos do Drive aparecem nas coleções. ✅
2. Chat: http://127.0.0.1:8091/chat/ — pergunte algo que está nos docs; resposta vem **com fontes** (link + score). ✅
3. Sobe o `serve` contínuo: `docker compose -f src/infra/docker-compose.yml up -d importer` (webhook se houver `DRIVE_WEBHOOK_URL`, senão poll). ✅

Atualizações futuras usam o deploy idempotente (valida + backup + health-gate): [`runbook.md`](runbook.md#deploy-subiratualizar-o-stack).

Se algo falhou, veja a tabela abaixo. Se passou tudo: operação diária em [`runbook.md`](runbook.md), porquês em [`architecture.md`](architecture.md).

## Erros comuns neste tutorial

| Sintoma | Causa provável |
|---|---|
| `seed` falha com 403 do Google | Drive API ou Docs API desativada; ou pasta não compartilhada com a SA |
| `seed` falha com `invalid_grant` | JSON da SA errado/antigo; `DRIVE_SA_KEY_PATH` apontando para lugar inexistente |
| Outline vazio após `seed` | token do importador sem escrita; `OUTLINE_COLLECTION_MAP` sem a pasta (e sem default) |
| Chat sempre "não encontrei" | workspace vazio (`seed` não rodou) ou `CHAT_MIN_SCORE` alto demais; confira `verify` |
| `verify` exit 1 logo no início | normal antes do primeiro `seed` completo — rode `seed`, depois `verify` |
| AnythingLLM 429/503 | cota de todas as chaves esgotou: confira `GET /healthz` do gateway e acrescente outra conta em `GEMINI_API_KEYS` |
| `llm-gateway` unhealthy no boot | `GEMINI_API_KEYS` (ou `GEMINI_API_KEY`) vazio — o gateway se recusa a subir sem chave |
