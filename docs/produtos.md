# Produtos (campos, telas, preço pelo mercado)

Trecho movido do CLAUDE.md (referenciado por lá).

`produto.estoque_minimo` + `estoque_minimo_embalagem` (`db/09_estoque_minimo.sql`) are the per-product
low-stock alert: `produtosEstoqueBaixo` flags rows where `estoque <= COALESCE(estoque_minimo, <default>)`,
the embalagem string is just the alert wording ("Areia abaixo de 2 caixa(s)"). `produto.preco_embalagem`
(`db/12`) is a second sale price for the **whole package** (fardo/caixa/…) when it's sold both loose and
closed at different prices — nullable, shown in the form only when `unidade` ∉ {unidade, granel}. The
"Preço de venda" label is dynamic (`por kg` / `por un` / `por dz`). `atualizarProduto` fully replaces all
of these (the produtos form always sends them); partial-update callers like the purchase importer must
read the current values through and pass them back, same as they already do for name/categoria.

**Not wired into `/venda` yet** — selling by the package (parsing "um fardo de arroz", picking
`preco_embalagem` over `preco`, deducting stock right) is a follow-up.

`produto.foto` (added in `db/08_foto_produto.sql`) holds an optional product photo as a
`data:image/jpeg;base64,…` string in a `text` column — no object storage, same by-hand ethos as the rest.
It's deliberately **kept out of `CAMPOS`** (the shared column list every produto query selects): list/search
rows only carry a computed `tem_foto` boolean, and the image itself is fetched lazily as real bytes from
`GET /api/produtos/:id/foto` (decodes the data URL). `criarProduto` takes an optional `foto`; in
`atualizarProduto` the param is tri-state — `undefined` keeps the current photo, `""` clears it, a data URL
replaces it (SQL `CASE`), so existing callers that don't pass `foto` (the purchase importer) leave it alone.
Client-side downscale for these is `comprimirParaDataURL` in `src/lib/imagemCliente.ts` (900px / q0.7,
smaller than the 1800px vision uploads); the shared `<CampoFoto>` component wraps capture + preview.

### Produtos screens

`/produtos` is **list-only**: a `.grade-kpi` row of `<Estatistica>` cards (same KPI component as
`/relatorios`) up top — **Produtos cadastrados**, **Em estoque** (`estoque > 0`), **Sem preço de venda**
(`preco <= 0`, highlighted via `negativo` when > 0), all computed client-side from the already-loaded
`itens` (the list endpoint is uncapped — see below, no extra query needed) — then the grid
(`.grade-produtos` / `.card-produto` cards — photo, price, cost/margin, and a `.botao-estoque` chip —
button-styled, **solid amber when `estoque <= estoque_minimo ?? 3`**; tapping it swaps in an inline
`.editar-estoque` field → `PATCH /api/produtos/:id {estoque}` → `atualizarEstoqueProduto` → reload), a
name filter, and five actions: **+ Novo produto** (→
`/produtos/novo`), **📷 Novo produto por foto** (compresses the photo → stashes it in
`sessionStorage["mpmf.novoProdutoFoto"]` → `/produtos/novo`), **📦 Atualizar estoque por foto** (→
`/produtos/estoque-foto`, a different flow that only bumps `estoque`), **🎥 Atualizar estoque por vídeo**
(→ `/produtos/estoque-video`, recorded narrated video → estoque + optional price + photo, see above), and
**💲 Preencher preço pelo mercado** (below — disabled when there's nothing sem-preço).

**Preço pelo mercado** — for products missing a sale price, searches the web for each one's average
Brazilian retail price and suggests `preço = média × (1 + percentual/100)`, percentual typed once by the
shopkeeper. No dedicated price API — `src/lib/precoMercado.ts` (`buscarPrecoMedioMercado`) gives Claude
Anthropic's **`web_search_20250305` server tool** (`tools: [{type:"web_search_20250305", name:"web_search",
max_uses: produtos.length*2, user_location:{type:"approximate", country:"BR"}}]`) alongside the usual
`output_config.format` JSON schema — confirmed empirically that combining a server tool with structured
output works in one non-streaming call (`stop_reason` resolves to `"end_turn"`, no manual
tool-result/`pause_turn` loop needed, unlike client-defined tools). **Several products ride in one call**
(one numbered list in the prompt, told to return one search result per product in the same order) — the
model does roughly one search per product rather than one call per product, which matters both for cost
and for staying under the serverless time limit (same timeout lesson as the video-import frame cap
elsewhere in this doc). Uses `claude-sonnet-5` (`ANTHROPIC_MODEL_VIDEO` env var, shared with the
estoque-video text step) rather than the Opus default — this is read-and-synthesize over search results,
not vision, and Sonnet is markedly cheaper; a 3-product batch measured ~13s and ~$0.09 total. Matching is
by normalized product name (`semAcento` + lowercase) with a positional fallback, since the model doesn't
always echo results back in the exact list order. Response items carry a `fonte` string (the store/site
names the model used to compute the average, e.g. "Pão de Açúcar, Extra, Carrefour") shown on the review
card so the shopkeeper can judge how trustworthy a given average is.

Flow: `POST /api/produtos/preco-mercado {produtos:[{id,nome}]}` (capped at `MAX_PRODUTOS_POR_LOTE = 10`
per call; the client silently batches only the first 10 sem-preço products and tells the shopkeeper to
run it again for the rest) returns suggestions — **writes nothing yet**, review cards appear below (same
show-before-write convention as every other AI-assisted screen in this app) with the found average, the
source, an editable suggested price, and an include checkbox. `POST
/api/produtos/preco-mercado/confirmar {itens:[{produtoId,novoPreco}]}` then calls `atualizarPrecoProduto`
per item — same narrow single-column update `estoque-video`'s price path uses, untouched otherwise.

The add/edit **form is its own screen** — `src/components/FormularioProduto.tsx`, rendered by
`/produtos/novo` (create) and `/produtos/editar/[id]` (edit, fetches via `GET /api/produtos/:id`). On
`/produtos/novo` it picks up the stashed photo and calls `/api/produtos/identificar-foto` to prefill the
name. On save it drops a message in `sessionStorage["mpmf.produtoFlash"]` and routes back to `/produtos`,
which shows it. The price-lookup screen's edit pencil links straight to `/produtos/editar/<id>`.

`POST /api/produtos` and `PUT /api/produtos/:id` return the raw Postgres error text in a `detalhe` field
on 500 (surfaced in the UI) — deliberate, so a missing migration on a deployed DB is diagnosable instead
of a blank "não foi possível salvar".

**Stock field gotcha:** the DB returns `numeric` as `"3.000"`. `FormularioProduto` must load
`estoque`/`estoque_minimo` as `String(Number(p.estoque))` and send `estoque` back as **raw text**
(the server's `validar` does `Number(str.replace(",","."))`). Never run `estoque` through
`moedaParaNumero` — it strips the dot as a thousands separator (`"3.000"` → `3000`), which
compounded on every edit.
