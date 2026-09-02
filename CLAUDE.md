# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A point-of-sale / small-store management app for Brazilian mercadinhos (corner stores), in Portuguese
throughout (UI, code identifiers, comments, commit style). Next.js 15 (App Router) + TypeScript, single
project for frontend and API, PostgreSQL via `pg`. Multi-tenant: many `empresa` (stores), each with its
own users and products; a `super_admin` approves new stores and has no store of their own unless one is
explicitly assigned.

Core interaction pattern: a search field with a microphone button. Speech (`webkitSpeechRecognition`,
`pt-BR`, runs client-side — no voice API cost) or typed text queries Postgres via `unaccent` + `pg_trgm`
fuzzy matching, tolerant of accents and transcription errors (e.g. "gulão", "gulao", "gulan" all resolve
to the same product).

## Commands

```bash
npm run dev            # http://localhost:3000
npm run dev:https      # HTTPS on 0.0.0.0, for testing from phones on the LAN — no server.mjs needed
npm run build
npm run start           # production, HTTP, port 3000
npm run start:https     # production, HTTPS via server.mjs — requires certificados/ (see below)
```

No test suite and no linter are configured. `tsc` runs implicitly via `next build`; there is no standalone
typecheck script.

### Database

There is no migration tool — SQL files under `db/` are applied by hand against the database named in
`DATABASE_URL`. **`db/01_schema.sql` through `db/07_caixa.sql` do NOT reflect the real schema** — the
`empresa`/`usuario` tables and several `produto` columns (`empresa_id`, `tipo_venda`, `preco_compra`) were
added by hand at some point (e.g. via DBeaver) and never captured in a numbered migration file. The
authoritative current schema is `db/referencia_schema_completo.sql`, a `pg_dump --schema-only` snapshot —
use it (not 01-07) to stand up a new database from scratch, or as the reference when writing new migrations.
It's a one-shot snapshot, not part of the sequential chain — don't run it after 01-07 (the tables would
already exist) and don't edit it; schema changes from here on go in a new `db/08_..._.sql`+ file. `00_completo.sql`
at the repo root is separately stale (older, single-tenant, pre-dates `empresa`/`usuario` entirely) — ignore it too.

### HTTPS for LAN testing (balcão / checkout counter)

`npm run dev:https` needs no setup. `npm run start:https` (production) needs certificates first:
run `gerar-certificado.bat` as Administrator (installs mkcert, generates `certificados/cert.pem` and
`certificados/key.pem` for `localhost` + the machine's LAN IP). `server.mjs` refuses to start without them.

### Environment

Copy `.env.example` to `.env.local`. Required: `DATABASE_URL`, `SESSION_SECRET` (≥24 chars — session
signing fails loudly otherwise). Optional: `ANTHROPIC_API_KEY` (vision features), `PIX_*` (fallback
static Pix key/name/city — only used when a store hasn't set its own key in `/configuracoes`).

## Architecture

### Auth & sessions — no external library

`src/lib/auth.ts` implements session tokens as HMAC-SHA256-signed, base64url JSON cookies using Web
Crypto (`crypto.subtle`), *not* `node:crypto` — this is deliberate, not an oversight: `middleware.ts` runs
on the Edge Runtime and needs `auth.ts` importable there. Password hashing (`src/lib/senha.ts`, scrypt) is
kept in a **separate** file for the opposite reason: it needs `node:crypto`, which the Edge Runtime can't
bundle, so it must never be imported from `auth.ts` or anything the middleware pulls in.

`middleware.ts` gates every route except `/login`, `/cadastro`, and `/api/*` (each API route checks its
own session — see below) and `_next`/static assets. `/admin/*` additionally requires `papel === "super_admin"`.

**Social login (Google/Facebook)** is hand-rolled Authorization Code, no library — `src/lib/oauth.ts`
(`PROVEDORES` config, `urlAutorizacao`, `trocarCodigo`) + routes `src/app/api/auth/oauth/[provedor]`
(start, sets a `oauth_state` cookie) and `.../callback`. The callback: identity match on
`usuario_identidade (provedor, provedor_id)` → login; else email match → link the identity → login; else
sign a short `cadastro_social` cookie (`src/lib/auth.ts` `criarCadastroSocial`) and send to
`/cadastro?social=1`, where `POST /api/empresas` reads that cookie to create `empresa` + `usuario` (no
`senha_hash` — `db/13` makes it nullable) + `usuario_identidade`. The approval-check + token-mint logic is
shared by both password and OAuth login via `autorizarLogin()` in `src/lib/login.ts`. Env:
`GOOGLE_/FACEBOOK_CLIENT_ID/SECRET` + `APP_URL` (canonical origin for the callback URL); unset → the
buttons show but bounce to `/login?erro=provedor-nao-configurado`.

`trocarCodigo` also returns the provider's profile-picture URL (`picture` for Google, `picture.data.url`
for Facebook — the userinfo URL asks for it, silhouettes dropped). `baixarFotoComoDataUrl` (in `oauth.ts`,
best-effort: https only, `image/*`, ≤2MB, any failure → `null`) turns it into a data URL, and
`definirFotoUsuarioSeVazia` writes it to `usuario.foto` **only when that column is null/empty** — so a
photo the user later sets in `/perfil` is never clobbered. The callback fills it on every social login
(login-by-identity and email-link paths); the new-signup path carries the short URL in the
`cadastro_social` cookie (`fotoUrl`) and `POST /api/empresas` downloads it after COMMIT, outside the
transaction.

`src/lib/sessao.ts` provides the server-side session helpers used by API routes:
- `exigirSessao()` — any logged-in user, or a ready-made 401 response
- `exigirSuperAdmin()` — super admin only, or a ready-made 403
- `exigirEmpresa()` — a user with a store, returning `empresaId` — **the empresa_id always comes from the
  session, never from the request body**, so a user can't touch another store's data by passing a
  different id. Every API route and `src/lib/db.ts` query that's scoped to a store follows this pattern:
  take `empresaId` from the session, pass it as a query parameter, and include it in the `WHERE`/`UPDATE`
  clause alongside the row id.

### Data layer

`src/lib/db.ts` holds a single shared `pg.Pool` (cached on `global` in dev to survive HMR reloads) plus all
query functions, grouped by domain with `// ---------- section ----------` comments: produtos, empresas/usuarios,
custos, cascos (crate/bottle loans to customers), caixa (daily till closing), relatorios (read-only
aggregations for the `/relatorios` dashboard — see below). There's no query builder or
ORM — raw parameterized SQL throughout. Follow the existing per-domain grouping when adding new queries
rather than introducing a new data-access pattern.

In production the pool connects through Neon's pooled (PgBouncer) endpoint — needed because serverless
functions open connections far more often than a long-lived server would, and Neon's *direct* endpoint has
a low connection cap that doesn't survive that pattern. The pooler can hand out a cached server-side
connection whose `search_path` doesn't match the database's configured default (observed empty even after
`ALTER DATABASE ... SET search_path`), which breaks every unqualified table reference. `pool.on("connect", ...)`
forces `SET search_path TO public` on every new physical connection to route around that — don't remove it.

**Auto-migrate**: `garantirSchema()` runs every statement in `MIGRACOES_IDEMPOTENTES` (the additive
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` from `db/08`–`db/10`) — **one
`pool.query` per statement** (Neon's pooler chokes on multi-statement), result cached per process, retried
on failure. Every `db.ts` domain function that touches those tables does `await garantirSchema()` first.
This exists because the hand-applied migration repeatedly missed the Neon branch the deployment uses and
every screen 500s without the columns. New migrations still go in `db/NN_*.sql`; mirror a pure
`ADD COLUMN / CREATE TABLE ... IF NOT EXISTS` one into `MIGRACOES_IDEMPOTENTES` too. The product/empresa/
client/fiado routes also return the raw Postgres error in a `detalhe` field on 500.

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

Fuzzy product search (`buscar_produto` SQL function, defined in `db/01_schema.sql`) ranks by: exact
barcode match (1.0) > name prefix/substring match (0.85–0.95) > all-words-present > trigram similarity.
`pg_trgm.similarity_threshold` is lowered to `0.22` (Postgres default is `0.3`) because voice transcription
needs more tolerance than typo-correction does.

### Purchase-receipt import (`/compras/importar`)

`src/lib/importarCompra.ts` sends a photo of a supplier's purchase receipt (NFC-e) to Claude
(`@anthropic-ai/sdk`, model `ANTHROPIC_MODEL` env var or `claude-opus-5` default) as a vision request
constrained with `output_config.format` (structured outputs) so the response is guaranteed-parseable JSON
line items — no free-text parsing. The prompt explicitly tells the model to cross-check smudged/creased
digits against `quantidade × valorUnitario ≈ valorTotal`, which in practice resolves illegible printed
numbers correctly. `POST /api/importar-compra` (multipart) runs the extraction and, per item, calls the
existing `buscarProduto` (the same fuzzy-match SQL function the voice search uses) to suggest a matching
catalog product above a similarity threshold — nothing is written to the database at this step. The client
reviews/edits every line (matched-product toggle, editable prices) before `POST /api/importar-compra/confirmar`
applies it: matched items go through `atualizarProduto` (preserving all fields except price), unmatched ones
create a new product via `criarProduto`. Sale price is always purchase price × 1.38, rounded to cents; stock
(`estoque`) is deliberately left untouched by this flow. The upload photo is downscaled/re-encoded to JPEG
client-side (`compras/importar/page.tsx`, canvas, max 1800px long edge) before it's sent — both to stay under
serverless request-body limits and to control vision token cost.

The client-side JPEG compression (`src/lib/imagemCliente.ts`, `comprimirImagem`) is shared with the shelf-photo
stock update below — don't duplicate it per screen.

### Shelf-photo stock update (`/produtos/estoque-foto`)

Same vision-extraction shape as the receipt importer (`src/lib/lerEstoqueFoto.ts`), but for counting visible
stock rather than reading a receipt, and it accepts **multiple photos in one request** (`fotos` form field,
repeated) — all images ride in a single Claude call as multiple `image` content blocks, with the prompt told
to treat each photo as a different shelf/area and sum counts for a product that reappears across photos, so
this stays one API call regardless of photo count rather than one per photo. `POST /api/produtos/estoque-foto`
matches each detected product against the catalog via `buscarProduto`, same threshold as the purchase importer.
For a match, the review screen only lets you edit the estoque number — `atualizarEstoqueProduto` in `db.ts` is
a narrow single-column `UPDATE ... SET estoque` (unlike `atualizarProduto`, which replaces the whole row), so
this path never touches price, name, or category. For no match, the item is included by default as a **new**
product (name/embalagem/tipo-venda editable, stock prefilled from the photo count) — sale price has no source
in a shelf photo, so that field starts empty and must be filled before saving, by typing or via the same
voice-input component (`CampoVoz`/`useVoz`) used on the Produtos screen; the confirm route rejects a new-product
line with no price rather than defaulting it. Created products get `preco_compra = 0` (unknown from a shelf
photo) — expect the margin display on Produtos to show 100% until someone corrects it from a real invoice.

### Produtos screens

`/produtos` is **list-only**: the grid (`.grade-produtos` / `.card-produto` cards — photo, price,
cost/margin, and an `.estoque-cel` badge that turns red via `data-critico` when
`estoque <= estoque_minimo ?? 3`), a name filter, and three actions: **+ Novo produto** (→
`/produtos/novo`), **📷 Novo produto por foto** (compresses the photo → stashes it in
`sessionStorage["mpmf.novoProdutoFoto"]` → `/produtos/novo`), and **📦 Atualizar estoque por foto** (→
`/produtos/estoque-foto`, a different flow that only bumps `estoque`).

The add/edit **form is its own screen** — `src/components/FormularioProduto.tsx`, rendered by
`/produtos/novo` (create) and `/produtos/editar/[id]` (edit, fetches via `GET /api/produtos/:id`). On
`/produtos/novo` it picks up the stashed photo and calls `/api/produtos/identificar-foto` to prefill the
name. On save it drops a message in `sessionStorage["mpmf.produtoFlash"]` and routes back to `/produtos`,
which shows it. The price-lookup screen's edit pencil links straight to `/produtos/editar/<id>`.

`POST /api/produtos` and `PUT /api/produtos/:id` return the raw Postgres error text in a `detalhe` field
on 500 (surfaced in the UI) — deliberate, so a missing migration on a deployed DB is diagnosable instead
of a blank "não foi possível salvar".

### Configurações, clientes, fiado (`db/10`)

- `/configuracoes` (client screen, `GET`/`PUT /api/empresa`) — the store edits its **own** row:
  name, CNPJ (`empresa.documento`), address, hours (`horario`), and the **Pix key** (`pix_chave` /
  `pix_nome`, added to `empresa`). Only non-super-admins have the `LOJA` menu, so only they see it.
  `/cadastro` (public store sign-up, `POST /api/empresas`) collects the same `horario` / `pix_chave` /
  `pix_nome` up front so a freshly approved store already has a working Pix QR.
- **WhatsApp on every phone field** (`db/14`) — `<CampoTelefone>` (`src/components/CampoTelefone.tsx`)
  replaces a bare phone `CampoVoz` everywhere: phone input + mic + an "Esse número é WhatsApp" checkbox,
  and a green `wa.me` shortcut once it's marked. Persisted as `empresa.telefone_whatsapp` /
  `casco.telefone_whatsapp` / `cliente.whatsapp`. Lists (`/clientes`, `/cascos`) show a `.zap-link` icon
  linking to `linkWhatsapp()` (`src/lib/whatsapp.ts`, normalizes any BR number to `https://wa.me/55…`).
- `/clientes` — **list-only** (produtos-pattern): `+ Novo cliente` → `/clientes/novo` (renders
  `<FormularioCliente>`, drops `sessionStorage["mpmf.clienteFlash"]`, routes back). `<FormularioCliente>`
  is still a shared component — also the `/venda` fiado picker and `<SeletorCliente>`. `cliente` table.
  **Photo (`foto`, data URL) and `endereco` are NOT NULL / required**; `cpf`, `telefone`, `whatsapp` bool,
  `cep`, `nota` (1–10, `db/11`) optional. Photo via `GET /api/clientes/:id/foto`. Rows show `saldo_fiado`
  (subselect over open `fiado`), a `.nota-cliente` badge, and a **left border coloured by `nota`**
  (`sinalNota`: ≥7 green / 4–6 amber / ≤3 red — `li[data-nota]` + `.nota-cliente[data-sinal]`).
- `/contas` ("Contas a receber") — filter default **"todas"**; `+ Nova conta a receber` toggles an inline
  fiado form (`<SeletorCliente>` + valor + descrição → `POST /api/fiado`).
- `/produtos` cards with no photo: the `📷` placeholder is a clickable `<label>` ("Tirar foto") — camera →
  `comprimirParaDataURL` → `PUT /api/produtos/:id/foto` (`atualizarFotoProduto`, narrow `UPDATE … SET
  foto`, doesn't touch the rest of the row) → reload.
- `<SeletorCliente>` / `<SeletorFornecedor>` — the search-existing-or-cadastrar-novo picker pattern
  (embed `<FormularioCliente>` / `<FormularioFornecedor>` inline).
- `/admin/empresas` — filter default **"todas"**; the new/edit forms use `<CampoTelefone>` (persists
  `empresa.telefone_whatsapp` via `editarEmpresa` / the admin `POST /api/empresas` branch), so the list's
  `<DadosContato>` WhatsApp shortcut works for admin-managed stores too.
- **Cross-tenant reputation** — `GET /api/clientes/reputacao?cpf=` (`reputacaoPorCpf`) is the one query
  that deliberately ignores `empresa_id`: it averages `nota` for a CPF across **all** stores so a
  shopkeeper can gauge a new fiado customer. It returns only aggregates (`media`, `avaliacoes`,
  `cadastros`) — never a name/address/row from another store. `FormularioCliente` calls it as the CPF is
  typed.
- **Fiado** (`fiado` table: `cliente_id`, `valor`, `descricao`, `pago`) — a payment option on `/venda`.
  `/contas` ("Contas a receber") groups open debts by client with per-entry "marcar pago" and per-client
  "quitar tudo". `criarFiado` re-checks `cliente.empresa_id` in the INSERT so a session can't post to
  another store's client.

Still **no sales ledger** — a split sale persists nothing except its `fiado` parts.

### Contact block + copy button + voice filter (shared list widgets)

- `<DadosContato>` (`src/components/DadosContato.tsx`) — the row of contact chips reused by
  `/fornecedores`, `/clientes`, `/cascos`, `/admin/empresas`: documento, telefone (📞 + `tel:` link + copy
  + green WhatsApp shortcut when marked), `local` (📍, opens Google Maps), `pixChave` (⚡ + copy). Replaces
  the old per-page `.sub` join + inline `IconeZap`.
- `<BotaoCopiar texto=…>` — clipboard copy with a 1.5s "Copiado!" flip. (Note: `.pix-valor` is already
  taken by `PainelPix` on `/venda`; the chip uses `.chip-pix-valor`.)
- `<FiltroVoz valor aoMudar placeholder>` — the standard list-filter input **with a mic** (every textbox
  in this project has one). Used on `/clientes`, `/fornecedores`, `/contas-pagar` (by fornecedor name),
  `/admin/empresas` (by name). `/produtos` still has its own inline copy.
- List filters hit `?q=` / `?fornecedor=` params (`f_unaccent` `LIKE`): `listarEmpresas(situacao, q)`,
  `listarFornecedores(empresaId, q)`, `listarContasPagar(empresaId, situacao, fornecedorQ)`.

### Fornecedores + contas a pagar (`db/16`–`db/19`)

Two linked tables. `fornecedor` (nome required; `documento`/`telefone`+`telefone_whatsapp`/`endereco`/
`observacao`/`pix_chave` (`db/19` — shown with a copy button on `/fornecedores` and on the conta-a-pagar
row, to pay the supplier by Pix) optional — same `<CampoTelefone>` WhatsApp treatment as everything
else). `conta_pagar`
(`fornecedor_id` nullable `ON DELETE SET NULL`, `categoria` (`db/17`), `descricao`, `valor`, `vencimento`
date, `foto` data-URL text like the others, `pago`/`pago_em`). `categoria` is **free text**: the form's
button row offers `CATEGORIAS_CONTA_PAGAR` from `db.ts` (mercadoria/energia/agua/aluguel/telefone/imposto/
salario/boleto — pretty labels in the page) plus "Outros" → a free-text box; the server just trims and
caps it at 40 chars. `categoriasContaPagarUsadas` returns the distinct custom values the store has used
and the GET list response carries them (`categorias`), so past custom categories come back as extra
buttons. The vision extractor guesses a standard value. `criarContaPagar` also takes `pago` (form's
"esta conta já está paga" → row inserted `pago_em = now()`) and `recorrente` (`db/18`). When
`marcarContaPagarPaga` quits a `recorrente` row it **clones the next month's occurrence** in the same
call (`vencimento + interval '1 month'`, no foto) and returns `proximaVencimento` for the toast;
re-paying after a reopen clones again (accepted).

- `/fornecedores` — list + `<FormularioFornecedor>` (shared: also embedded in `/contas-pagar`'s supplier
  picker, and pre-fillable via `inicial={{nome, documento}}` from a scanned bill). `/api/fornecedores`
  (+`?q=` name/CNPJ filter) and `/api/fornecedores/:id`.
- `/contas-pagar` — **list-only**, same shape as `/produtos`: `+ Nova conta a pagar` (→
  `/contas-pagar/nova`) and `📷 Nova conta por foto` (compresses the photo → `sessionStorage
  ["mpmf.contaPagarFoto"]` → `/contas-pagar/nova`, which reads the stash and runs the extraction on
  mount). em-aberto/pagas/todas tabs (**default "todas"**) + a `<FiltroVoz>` by fornecedor name, per-row
  "marcar pago"/"reabrir" (`PATCH …/:id {acao}`), overdue rows in `--tomate`, and a Pix copy chip when
  the linked fornecedor has a `pix_chave`. **Ordered by `vencimento DESC NULLS LAST`** (latest due date on
  top). The `/contas-pagar/nova` form drops a `sessionStorage["mpmf.contaPagarFlash"]` message and routes
  back.
- The photo of a boleto/nota (`<CampoFoto>` default `capture="environment"` — camera on mobile) → `POST
  /api/contas-pagar/ler-foto` → `src/lib/lerContaPagar.ts` (vision, `output_config` JSON schema, same
  shape as `importarCompra.ts`) pulls `{fornecedorNome, fornecedorDocumento, categoria, valor,
  vencimento, documento}`, and `acharFornecedorParecido` (in `db.ts` — CNPJ-digits exact match, else
  `pg_trgm` `similarity` on the name) suggests an existing supplier; no match + a name read → inline
  `<FormularioFornecedor>` prefilled. The photo is stored on the `conta_pagar` row and served as bytes
  from `/api/contas-pagar/:id/foto` (kept out of the list query — only `tem_foto`). Client-shared
  constants/helpers (labels, `prazoVencimento`) live in `src/lib/contasPagar.ts` (no `pg` import).
  **Paying a conta does NOT create a `custo`** — the two are separate ledgers.

### Reports dashboard (`/relatorios`)

There is **no sales ledger / stock-movement table** — the app records the current product row
(`estoque`, `preco`, `preco_compra`), manual expense entries (`custo`), daily till closings (`caixa`),
and crate loans (`casco`), but never an individual sale. Everything on `/relatorios` is therefore a
read-only derivation over those four tables: KPIs and inventory value from `produto`, spend charts from
`custo`, and the "revenue" trend line is **approximated by the daily `caixa` closing** because nothing
finer exists. Keep this in mind before adding any report that needs per-sale data — it would need a new
table and a write path first.

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

### Voice input

`src/lib/voz.ts` is pure text-processing (no DOM/browser APIs): Portuguese number-words → digits
(`frasePraNumero`, `numeroFalado`), and splitting a spoken phrase like "gelo, quarenta reais" into
item + price (`separarServicoValor`) by scanning backward from the end of the utterance for value-like
tokens. `src/lib/useVoz.ts` is the client hook wrapping `webkitSpeechRecognition`/`SpeechRecognition`,
one field listens at a time. `src/lib/falaVenda.ts` builds on both for the sales screen specifically.
Firefox has no Web Speech API — screens must fall back to typing and say so (see README table).

`interpretarItem` (`falaVenda.ts`) also recognises a **spoken money amount instead of a quantity** —
"dez reais de tomate" / "tomate dez reais" → `{valorReais: 10, termo: "tomate"}`. `/venda`'s
`adicionarProduto(produto, quantidade, emPeso, valorReais?)` then sets `quantidade = valorReais /
produto.preco` (kept as kg for `tipo_venda === "quilo"`, rounded to whole pieces otherwise) and the
confirmation reads "Tomate: R$ 10,00 ≈ 313 g". `valorReais` rides through the `Escolha` and `ProdutoNovo`
states so the multi-match and cadastrar-na-hora paths compute it too.

### Money handling

Money is entered and displayed as comma-decimal strings (`"4,50"`), the pt-BR convention, via
`src/lib/moeda.ts`. Voice input for prices funnels through the same `paraMoeda`/`moedaParaNumero`
conversions as manual typing — don't add a separate parser for voice-originated values.

### Pix payments

`src/lib/pix.ts` builds the BR Code (EMV QR payload) by hand per the Banco Central spec — no external Pix
library, and **no Mercado Pago** (removed). `POST /api/pix` reads the store's `pix_chave` / `pix_nome`
from `empresa` (set in `/configuracoes`; falls back to `PIX_*` env) and returns a static "copia e cola".
There is no payment confirmation — `PainelPix` shows the QR and a manual "Recebi o Pix" button.

### Roles

Three `papel` values: `super_admin` (approves/rejects stores in `/admin/empresas`, may optionally own a
store per `db/03_super_admin_dono_loja.sql`), `admin`, `operador` — both scoped to one `empresa` via
`empresa_id`, which is `NOT NULL`-enforced by a check constraint for non-super-admins.

### Account menu (`MenuLateral`)

`.conta-topo` is a fixed **top-right** circular button showing the user's photo (`GET /api/auth/foto` —
`usuario.foto`, `db/15`, data-URL `text` like `produto.foto`; falls back to an initials disc via an
`onError` on the `<img>`). It sits at `right:14px`; the cart shortcut (`.atalho-venda`) moved to
`right:64px` to make room. Clicking opens `.conta-menu`, a dropdown (`.fundo-conta` backdrop) petroprep-
style: name + store/role header, the large-text toggle (`<AjusteFonte>`, rendered **here**, not in
`layout.tsx` — `.conta-menu-fonte .ajuste-fonte` un-fixes its position), then **Configurações da empresa**
(`/configuracoes`, store users only — no longer in the main `LOJA` list), **Meu perfil** (`/perfil` — edit
own `usuario.nome` + photo via `<CampoFoto>`), **Trocar senha** (`/senha`), and **Sair**.

The left drawer (`.menu`) navigation is **grouped, collapsible** (`GRUPOS_LOJA` in `MenuLateral.tsx`):
🛒 Balcão (`/`, `/venda`, `/caixa`) · 📦 Produtos (`/produtos`, `/compras/importar`) · 💰 Financeiro
(`/contas-pagar`, `/contas`, `/custos`) · 👥 Cadastros (`/clientes`, `/fornecedores`, `/cascos`) · 📊
Relatórios (`href` + no `itens` → a direct link, not a group) · 🏢 Administração (`/admin/empresas`,
super-admin only). `gruposAbertos` is a `Set<string>` — "balcao" plus the group holding the current path
start open; navigating opens the new path's group without closing the others. When adding a route, add it
to a group's `itens`, not a flat list.

`GET/PUT /api/auth/perfil` — PUT takes `{nome, foto?}` (`foto` tri-state: key absent = keep, `""` = clear,
data URL = replace, same convention as `atualizarProduto`) and re-mints the session cookie so the new name
shows without re-login (the name lives inside the HMAC token); the `/perfil` page then does a full reload
so the menu picks up the new photo. `GET/PUT /api/auth/senha` — `conferirSenha` on the current password
first; Google-only accounts (`senha_hash IS NULL`) get a "no password" message instead of the form.

### UI conventions

No CSS framework — plain `globals.css`. `AjusteFonte` toggles a large-text mode (persisted to
`localStorage`, applied pre-paint via an inline `<script>` in `layout.tsx` to avoid a flash of normal-size
text); the toggle itself lives in the account menu (above), so `/login` and `/cadastro` apply the stored
preference but can't change it. All routes render inside `MenuLateral` (sidebar) from the root layout.
