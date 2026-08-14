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
custos, cascos (crate/bottle loans to customers), caixa (daily till closing). There's no query builder or
ORM — raw parameterized SQL throughout. Follow the existing per-domain grouping when adding new queries
rather than introducing a new data-access pattern.

In production the pool connects through Neon's pooled (PgBouncer) endpoint — needed because serverless
functions open connections far more often than a long-lived server would, and Neon's *direct* endpoint has
a low connection cap that doesn't survive that pattern. The pooler can hand out a cached server-side
connection whose `search_path` doesn't match the database's configured default (observed empty even after
`ALTER DATABASE ... SET search_path`), which breaks every unqualified table reference. `pool.on("connect", ...)`
forces `SET search_path TO public` on every new physical connection to route around that — don't remove it.

Fuzzy product search (`buscar_produto` SQL function, defined in `db/01_schema.sql`) ranks by: exact
barcode match (1.0) > name prefix/substring match (0.85–0.95) > all-words-present > trigram similarity.
`pg_trgm.similarity_threshold` is lowered to `0.22` (Postgres default is `0.3`) because voice transcription
needs more tolerance than typo-correction does.

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
