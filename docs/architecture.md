# Arquitetura

Três papéis bem separados: o Drive guarda a verdade, o Outline serve leitura, o AnythingLLM responde perguntas. O importador mantém os dois destinos em sincronia; o edge é o único ponto de entrada.

## Visão geral

```mermaid
flowchart TB
    Drive["Google Drive<br/>(Google Docs)"] -->|"changes.watch / poll"| IMP["import-drive<br/>seed · apply · verify · serve"]
    IMP -->|"documents.* (idempotente por hash)"| Outline["Outline<br/>(coleções só-leitura)"]
    IMP -->|"raw-text + metadata"| RAG["AnythingLLM<br/>workspace kb-drive<br/>Gemini chat + embeddings"]
    IMP -->|"resolve contentUri<br/>cache 20 min"| DocsAPI["Google Docs API"]

    subgraph Edge["edge :8091 (openresty) — único publicado"]
        W["/ → wiki (Outline) + snippet do chat"]
        C["/chat/ → chatui"]
        H["/hooks/drive → webhook"]
        I["/drive-image/ → imagens"]
    end

    Outline --> W
    RAG -->|"POST /v1/workspace/.../chat"| ChatUI["chatui<br/>answer + sources[]"]
    ChatUI --> C
    H --> IMP
    I --> IMP
```

| Peça | Papel | Detalhe de acesso |
|---|---|---|
| `apps/importer` | Espelha Drive → Outline e Drive → AnythingLLM; serve imagens | Único escrevente no Outline; lê o Drive com `drive.readonly` |
| `apps/chat` | Pergunta/resposta sobre `/v1/chat`, devolve resposta com fontes | API key só no backend; corta abaixo de `CHAT_MIN_SCORE` |
| edge (openresty) | Wiki + chat + webhook + imagens num ponto | Ver [`security.md`](security.md); limites em [`runbook.md`](runbook.md) |
| PostgreSQL / Redis | Persistência do Outline | Rede interna, sem porta publicada |

Composição completa dos serviços: `src/infra/README.md`.

## Importação

```mermaid
flowchart LR
    A["Doc muda no Drive"] --> B{"HTTPS público<br/>configurado?"}
    B -->|"sim"| C["changes.watch → POST /hooks/drive<br/>serve agenda apply (debounce)"]
    B -->|"não"| D["poll a cada 15 min<br/>+ apply manual"]
    C --> E["apply: lê changes.list incremental<br/>converte HTML → markdown"]
    D --> E
    E --> F["escreve Outline + AnythingLLM<br/>hash decide o que mudou"]
    F --> G["verify compara Drive ↔ estado ↔ workspace"]
```

Regras de seleção: entram só Google Docs; pastas listadas em `IMPORT_DRIVE_IGNORE_FOLDERS` ficam fora; cada pasta espelha a coleção homônima (`OUTLINE_COLLECTION_MAP` por ID quando configurado), ou cai na coleção default (`OUTLINE_DEFAULT_COLLECTION_ID`). O canal do Drive expira em até 7 dias — o `serve` renova antes e expõe o estado em `GET /healthz`. Comandos em [`runbook.md`](runbook.md); formato `raw-text` e demais detalhes em `apps/importer/README.md`.

## Imagens inline

```mermaid
sequenceDiagram
    participant Doc as Google Doc
    participant Imp as importador
    participant API as Docs API
    participant Nav as navegador
    Imp->>Doc: export HTML (imagem vem como data URI)
    Imp->>Imp: troca por /drive-image/docId/objectId
    Nav->>Imp: GET /drive-image/... (via edge)
    Imp->>API: resolve contentUri (documents.readonly)
    API-->>Nav: binário (cache em memória, 20 min)
```

Fora do estado → 404; Docs API fora → 502. Pré-requisito no GCP: Drive API + Docs API habilitadas. Diagnóstico em [`runbook.md`](runbook.md).

## Pergunta

```mermaid
flowchart LR
    Nav["bolha no wiki<br/>(?embed=1)"] --> Chat["chatui POST /ask"]
    Chat --> RAG2["AnythingLLM /v1/chat<br/>workspace kb-drive"]
    RAG2 --> Chat
    Chat -->|"textResponse + sources[]<br/>(link Drive/Outline + score)"| Nav2["resposta com citações<br/>ou 'não encontrei'"]
```

O widget nativo do AnythingLLM não devolve `sources` — por isso a UI própria é o único caminho (ver ADR 0002). Limites e erros: [`runbook.md`](runbook.md).

## Limites assumidos

- Outline não tem busca vetorial: serve leitura, não pergunta.
- Sem autenticação por documento na v1 — quem alcança o chat vê o acervo inteiro (ver [`security.md`](security.md)).
- Produção expõe 22/80/443; Postgres, Redis, AnythingLLM e importador nunca publicam porta.

Decisões que explicam o "porquê": [`adr/`](adr/).
