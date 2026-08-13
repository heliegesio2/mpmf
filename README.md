# Consulta de preço — Next.js + PostgreSQL

Uma tela só: um campo de busca com botão de microfone. Ao falar (ou digitar), a aplicação
consulta o PostgreSQL e mostra o produto e o valor.

## Stack

- **Next.js 15 + TypeScript** (App Router) — front e API no mesmo projeto
- **PostgreSQL** com `unaccent` + `pg_trgm` — busca tolerante a acento e a erro de transcrição
- **Web Speech API** (`webkitSpeechRecognition`, `pt-BR`) — o reconhecimento roda no navegador,
  então não há custo de API de voz

## Subir o banco

```bash
createdb mercadinho
psql -d mercadinho -f db/01_schema.sql
psql -d mercadinho -f db/02_seed.sql
```

O seed vem do `inventario_loja.csv` (40 mercadorias). **Os preços são valores iniciais por
categoria** — ajuste com:

```sql
UPDATE produto SET preco = 5.49 WHERE nome ILIKE '%gulao%';
```

## Rodar

```bash
cp .env.example .env.local   # aponte o DATABASE_URL
npm install
npm run dev                  # http://localhost:3000
```

## Como a busca funciona

`buscar_produto(termo, limite)` normaliza o texto (minúsculo, sem acento) e ranqueia por:

1. código de barras exato (score 1.0)
2. nome contendo o termo (0.85)
3. similaridade trigram do nome
4. similaridade da categoria (peso 0.6)

Isso cobre o caso da voz: "gulão pururuca", "gulao pururuca" e "gulan pururuca" caem no mesmo
produto. O limiar está em `0.22` (padrão do Postgres é `0.3`, alto demais para transcrição).

## Suporte a voz por navegador

| Navegador | Reconhecimento de fala |
|---|---|
| Chrome / Edge (desktop e Android) | sim |
| Safari iOS 14.5+ | sim |
| Firefox | não — a tela cai para digitação e avisa |

## Próximos passos sugeridos

- Campo `codigo` (EAN) + leitor de código de barras pela câmera
- Baixa de estoque e histórico de venda
- Autenticação para a tela de cadastro/edição de preço
