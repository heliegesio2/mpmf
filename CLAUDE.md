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
signing fails loudly otherwise). Optional: `PIX_*` (static Pix key/name/city for QR generation),
`MP_ACCESS_TOKEN`/`MP_EMAIL_CLIENTE` (Mercado Pago — enables payment-confirmation polling on the Pix QR;
without it the QR is generated locally with no confirmation).

## Architecture

### Auth & sessions — no external library

`src/lib/auth.ts` implements session tokens as HMAC-SHA256-signed, base64url JSON cookies using Web
Crypto (`crypto.subtle`), *not* `node:crypto` — this is deliberate, not an oversight: `middleware.ts` runs
on the Edge Runtime and needs `auth.ts` importable there. Password hashing (`src/lib/senha.ts`, scrypt) is
kept in a **separate** file for the opposite reason: it needs `node:crypto`, which the Edge Runtime can't
bundle, so it must never be imported from `auth.ts` or anything the middleware pulls in.

`middleware.ts` gates every route except `/login`, `/cadastro`, and `/api/*` (each API route checks its
own session — see below) and `_next`/static assets. `/admin/*` additionally requires `papel === "super_admin"`.

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

`produto.estoque_minimo` + `estoque_minimo_embalagem` (`db/09_estoque_minimo.sql`) are the per-product
low-stock alert: `produtosEstoqueBaixo` flags rows where `estoque <= COALESCE(estoque_minimo, <default>)`,
the embalagem string is just the alert wording ("Areia abaixo de 2 caixa(s)"). `atualizarProduto` fully
replaces both (the produtos form always sends them); partial-update callers like the purchase importer
must read the current values through and pass them back, same as they already do for name/categoria.

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

Cart items show the product photo (`<FotoProduto>` — an `<img>` hitting `/api/produtos/:id/foto` that
removes itself on the 404 for photoless products, since the `buscar_produto` SQL function doesn't return
`tem_foto`).

**Cart persistence** — the cart lives in `src/lib/carrinho.tsx` (`CarrinhoProvider` in the root layout,
`useCarrinho()` hook), mirrored to `localStorage` (`mpmf.carrinho`) so navigating away and back keeps the
items. It's emptied only on finish (`fechar()` snapshots `finalizada` for the receipt, then clears),
cancel (`novaVenda()`), or logout (`esquecerCarrinho()` in `MenuLateral`). The top-bar cart button
(`.atalho-venda`, hidden for a store-less super-admin) shows an item-count badge and links here.

### Voice input

`src/lib/voz.ts` is pure text-processing (no DOM/browser APIs): Portuguese number-words → digits
(`frasePraNumero`, `numeroFalado`), and splitting a spoken phrase like "gelo, quarenta reais" into
item + price (`separarServicoValor`) by scanning backward from the end of the utterance for value-like
tokens. `src/lib/useVoz.ts` is the client hook wrapping `webkitSpeechRecognition`/`SpeechRecognition`,
one field listens at a time. `src/lib/falaVenda.ts` builds on both for the sales screen specifically.
Firefox has no Web Speech API — screens must fall back to typing and say so (see README table).

### Money handling

Money is entered and displayed as comma-decimal strings (`"4,50"`), the pt-BR convention, via
`src/lib/moeda.ts`. Voice input for prices funnels through the same `paraMoeda`/`moedaParaNumero`
conversions as manual typing — don't add a separate parser for voice-originated values.

### Pix payments

`src/lib/pix.ts` builds the BR Code (EMV QR payload) by hand per the Banco Central spec — no external Pix
library. If `MP_ACCESS_TOKEN` is set, `src/app/api/pix/[id]/route.ts` polls Mercado Pago for payment
confirmation; without it, the QR is cosmetic (customer's bank app can still pay it, but the app has no way
to know when).

### Roles

Three `papel` values: `super_admin` (approves/rejects stores in `/admin/empresas`, may optionally own a
store per `db/03_super_admin_dono_loja.sql`), `admin`, `operador` — both scoped to one `empresa` via
`empresa_id`, which is `NOT NULL`-enforced by a check constraint for non-super-admins.

### UI conventions

No CSS framework — plain `globals.css`. `AjusteFonte` toggles a large-text mode (persisted to
`localStorage`, applied pre-paint via an inline `<script>` in `layout.tsx` to avoid a flash of normal-size
text). All routes render inside `MenuLateral` (sidebar) from the root layout.
