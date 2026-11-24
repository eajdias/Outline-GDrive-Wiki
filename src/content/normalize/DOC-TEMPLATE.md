# Template de documento PROCEDIMENTAL no padrão de qualidade

> Como usar: para tutoriais, passo a passo e rotinas de execução. Para tabelas de
> consulta, use `DOC-TEMPLATE-REFERENCIA.md`; para políticas e avisos, use
> `DOC-TEMPLATE-COMUNICADO.md`.
> Copie este arquivo para o doc-alvo, preencha as seções, apague as que não
> se aplicarem. Frontmatter: preserve o original byte a byte (§2 do STYLE-GUIDE).
> Doc de referência: qualquer doc do wiki já padronizado neste formato.

```markdown
> Dono: <time/área> · Revisado em: <AAAA-MM> · Vale para: <escopo/versões>.

## 🎯 Objetivo

<O que este documento entrega, em 1-2 frases. Quando usá-lo.>

## ⚡ Resumo rápido

| Momento | Ação |
| --- | --- |
| ==<prazo crítico 1>== | <ação> |
| ==<prazo crítico 2>== | <ação> |

## 🧭 Neste documento

- [<1. Primeira etapa>](#h-1-<slug-gerado-conforme-§11>)
- [<2. Segunda etapa>](#h-2-<slug-gerado-conforme-§11>)

## Pré-requisitos

- <ambiente, acesso ou ferramenta 1>
- <ambiente, acesso ou ferramenta 2>

## 1. <Emoji> <Primeira etapa>

<Explicação curta do passo.>

```bash
<comando exato>
```

:::warning
<Risco, efeito colateral ou aviso de compatibilidade.>
:::

## 2. <Emoji> <Segunda etapa>

<Explicação curta do passo. Rotina executável vira checklist clicável:>

- [ ] <ação 1>
- [ ] <ação 2>

```<linguagem>
<exemplo reconstruído somente se rotulado como ilustrativo — ver §5 do STYLE-GUIDE>
```

:::info
<Observação que no original era um `obs:` solto.>
:::

:::tip
<Atalho ou boa prática.>
:::

> <Fala/script de atendimento vai em quote, nunca em bullet aninhado.>

## Troubleshooting

| Sintoma | Causa | Solução |
| --- | --- | --- |
| <mensagem de erro> | <por quê acontece> | <o que fazer> |

:::success
<O que o leitor deve ver quando deu tudo certo.>
:::

## Referências

- [Rótulo descritivo](https://url-completa)
```
