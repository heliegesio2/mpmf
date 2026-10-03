# Venda, vendas, relatórios e Pix

Trecho movido do CLAUDE.md (referenciado por lá).

**Sales are now persisted** (`db/20` — `venda` + `venda_item` + `venda_pagamento`). On finish,
`fechar()` POSTs the cart to `POST /api/venda/concluir` (after the fiado inserts), which does
two **non-blocking** things (the sale is already paid — a failure is only logged): (1)
`registrarVenda` — inserts the sale header + line items + payment parts; `venda.data` is the
**client's local date** (sent in the body) so the `/vendas` day filter doesn't depend on the
server's UTC clock; (2) `baixarEstoqueVenda` — `UPDATE … SET estoque = GREATEST(0, estoque - qtd)
RETURNING id, estoque, estoque_minimo` per line, never negative. The route returns
`estoques` (`{id: {estoque, critico}}`), which `fechar()` stores in `finalizada`; the completion
receipt shows each item's remaining stock as a chip under its name — `.chip-estoque-venda`,
solid red only when `critico`.

**`/vendas`** — the sales history. Two `<input type="date">` (De defaults to **7 days before today**,
Até defaults to today), `GET /api/vendas?de=&ate=` → `listarVendas` (filters on `venda.data`, `json_agg`s
the payment parts), a period total, and a list: time + item count + `forma R$ valor + …` +
total. In the **balcão** menu group, labeled "Vendas do dia" (distinct from `/venda`).

**Excluir venda** — cada linha de `/vendas` tem "Excluir" (`confirm()` antes) → `DELETE /api/vendas/[id]` →
`excluirVenda`: grava snapshot (itens + pagamentos em jsonb) + `usuario_id`/`usuario_nome` (+ "via X" se
impersonando) em `venda_exclusao` (`db/42`), devolve o estoque dos itens, apaga a venda. Bloqueia (409) se
houver NFC-e `autorizado`. O **fiado** lançado na venda não é desfeito (sem vínculo venda↔fiado). Não há
tela pra ler o log ainda — só a tabela. Espelhado no mpmf-desktop (usuário fixo "Balcão (desktop)").

**Payment-method cards** — `.formas-pagamento`/`.forma-card`, one per `forma` that has a nonzero total in
the period (dinheiro/débito/crédito/pix/fiado, plus any other value found), each with an icon
(`ICONE_FORMA`), the R$ total, and the **% of the period total** it represents. All computed client-side
from the same `itens` the list already has — no separate endpoint.

### Reports dashboard (`/relatorios`)

**`/relatorios` doesn't use the `venda` ledger yet** (added in `db/20`, see the Sales screen section).
It still derives everything from the current product row (`estoque`, `preco`, `preco_compra`), manual
expense entries (`custo`), daily till closings (`caixa`), and crate loans (`casco`): KPIs and inventory
value from `produto`, spend charts from `custo`, and the "revenue" trend line **approximated by the daily
`caixa` closing**. A real per-sale revenue report is now possible off `venda`/`venda_item`/`venda_pagamento`
— wiring it into `/relatorios` is a follow-up.

`GET /api/relatorios` (`export const dynamic = "force-dynamic"`) runs every indicator in one
`Promise.all` and returns a single JSON blob; the page does one fetch on mount. All query functions live
in the `// ---------- relatorios ----------` group in `db.ts`, all `SELECT`-only, all cast money/counts to
`::float8`/`::int` so the client gets plain numbers. Charts (`src/components/Graficos.tsx`) are
hand-rolled — `Estatistica` (KPI card), `GraficoColunas`, `GraficoBarrasHorizontais`, and an inline-SVG
`GraficoLinha` with a touch/mouse cursor — no charting library; styling is CSS variables from `globals.css`.
`GraficoColunas` hides per-bar value labels past 6 categories (falls back to hover `title`).

### Sales screen (`/venda`)

Speech recognition here is **single-shot**, deliberately matching the price-lookup screen (`/`):
`continuous = false`, `interimResults = true`, one phrase per mic tap, no auto-restart. (It used to run
`continuous = true` with a self-restarting loop; item-by-item transcribes and matches far more reliably.)
One shared `SpeechRecognition` instance is routed by a `destino` ref — `"itens"` | `"recebido"` (cash
given) | `"novoPreco"` (price of a not-yet-catalogued product).

When a spoken item matches **nothing** in the catalog (after the full-term and last-word searches both
come back empty), the screen opens an inline "novo produto" panel with the full registration fields
(name, price, vendido-por, embalagem, stock, low-stock alert) and a `<CampoFoto>` — taking the photo
also fires `/api/produtos/identificar-foto` (vision) to auto-fill the name. Confirming `POST`s to
`/api/produtos` and drops the returned product straight into the cart with the originally-spoken
quantity. `novoAberto`/`escolhaAberta` refs block further speech while either panel is open.

Cart items show the product photo via `<FotoAmpliavel>` (`src/components/FotoAmpliavel.tsx`) — an `<img>`
that removes itself on the 404 for photoless products (`buscar_produto` doesn't return `tem_foto`) and
opens a full-screen `.foto-overlay` on click. Same component is used on the Produtos grid and Clientes.

**Payment is split into parts** — `partes: PartePagamento[]` (`{forma, valor, pixOk?, clienteId?}`),
`forma` ∈ dinheiro/debito/credito/pix/fiado. Tapping a form button **adds a part** pre-filled with the
remaining amount; tap another to split. `podeFinalizar` needs `soma(partes) ≥ total`, every pix part
confirmed (`PainelPix` "Recebi o Pix"), every fiado part with a `clienteId` (inline client search).
`fechar()` `POST`s `/api/fiado` for each fiado part **before** completing — a failure aborts the sale.
Nothing else about the sale persists. `finalizada` snapshots `{itens, partes}` for the receipt.

**Cart persistence** — the cart lives in `src/lib/carrinho.tsx` (`CarrinhoProvider` in the root layout,
`useCarrinho()` hook), mirrored to `localStorage` (`mpmf.carrinho`) so navigating away and back keeps the
items. It's emptied only on finish, cancel (`novaVenda()`), or logout (`esquecerCarrinho()` in
`MenuLateral`). The top-bar cart button (`.atalho-venda`, hidden for a store-less super-admin) shows an
item-count badge and links here.

### Pix payments

`src/lib/pix.ts` builds the BR Code (EMV QR payload) by hand per the Banco Central spec — no external Pix
library, and **no Mercado Pago** (removed). `POST /api/pix` reads the store's `pix_chave` / `pix_nome`
from `empresa` (set in `/configuracoes`; falls back to `PIX_*` env) and returns a static "copia e cola".
There is no payment confirmation — `PainelPix` shows the QR and a manual "Recebi o Pix" button.

**Venda por foto (`/venda/foto`)** — a "📷 Foto do balcão" button on `/venda` opens it: the shopkeeper
photographs the products the customer put on the counter, `src/lib/lerVendaFoto.ts` (vision, mirrors
`lerEstoqueFoto.ts`, multiple photos in one call) → `[{descricao, quantidade}]`, `POST /api/venda/foto`
matches each against the catalog with `buscarProduto` (`score >= 0.5` → `principal`, rest →
`alternativas`). The review list: matched rows have an editable qty (weight products default 1 with a
"confira o peso" warning) + "trocar" (alternativas or a `/api/produtos?q=` search) + an include checkbox;
unmatched rows show "não encontrei" and stay out. "Adicionar ao carrinho" merges the checked rows into
`useCarrinho()` (merge by `produto.id`) and routes to `/venda`. No new product creation in-flow (link
out to `/produtos/novo`).
