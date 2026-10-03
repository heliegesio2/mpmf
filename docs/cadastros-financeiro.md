# Cadastros e financeiro (clientes, fiado, fornecedores, contas, recorrências)

Trecho movido do CLAUDE.md (referenciado por lá).

### Configurações, clientes, fiado (`db/10`)

- `/configuracoes` (client screen, `GET`/`PUT /api/empresa`) — the store edits its **own** row:
  name, CNPJ (`empresa.documento`), address, hours (`horario`), and the **Pix key** (`pix_chave` /
  `pix_nome`, added to `empresa`). Only non-super-admins have the `LOJA` menu, so only they see it.
  `/cadastro` (public store sign-up, `POST /api/empresas`) collects the same `horario` / `pix_chave` /
  `pix_nome` up front so a freshly approved store already has a working Pix QR.
- **`/cadastro` forks (`db/23`)** — an **Empresa / Fornecedor** tab strip (`.abas-cadastro` /
  `.aba-cadastro`) at the top (hidden in `?social=1` mode). **Fornecedor** → the fornecedor fields (nome, documento, telefone+WhatsApp, endereço,
  observação, pix) + **bairros atendidos** (a checkbox grid from `GET /api/bairros?cidade=`) + email/senha
  → `POST /api/fornecedores/cadastro` (public). Creates a `fornecedor_publico` row (`pendente`, separate
  from each store's per-empresa `fornecedor` table) + `fornecedor_publico_bairro` links. The `bairro`
  table (`cidade, uf, nome`) is seeded in `MIGRACOES_IDEMPOTENTES` with the ~110 neighborhoods of
  **Conselheiro Lafaiete, MG** (the launch city).
- **`/admin/fornecedores` (`db/24`)** — the super admin reviews `fornecedor_publico`. Same shape as
  `/admin/empresas`: tabs (Aguardando/Aprovados/Reprovados/Todas), `<FiltroVoz>` by name/email,
  `<DadosContato>` + bairro chips per row, Aprovar / Reprovar (with a mandatory `motivo`).
  `GET /api/admin/fornecedores?situacao=&q=` + `PUT /api/admin/fornecedores/:id {situacao: "aprovado"|
  "reprovado", motivo?}` → `decidirFornecedorPublico`.
- **Fornecedor login (`db/25`)** — a `Papel` is now `... | "fornecedor"`, `Sessao` gets optional
  `fornecedorId`. `/login` is a single unified form (e-mail/senha + Google/Facebook, no
  empresa-vs-fornecedor choice — the empresa/fornecedor split lives only in `/cadastro`); it carries a
  full-width "Não sou cadastrado — cadastre-se" button to `/cadastro`. `POST /api/auth/login`: if
  `usuarioPorEmail` misses, tries `fornecedorPublicoPorEmail`
  — `pendente`/`reprovado` → 403 with the reason, `aprovado` + right password → mints a token
  `{usuarioId: 0, papel: "fornecedor", fornecedorId, empresaId: null}`, `destino: "/fornecedor"`.
  `middleware.ts` locks `papel === "fornecedor"` to exactly `/fornecedor` and `/fornecedor/*` (NOT
  `/fornecedores`), redirecting everything else there; non-fornecedores are bounced off `/fornecedor`.
  `exigirFornecedor()` in `sessao.ts`. `MenuLateral`'s `GRUPO_FORNECEDOR` has **Meu cadastro**
  (`/fornecedor`) + **Meus produtos** (`/fornecedor/produtos`).
  **`/fornecedor`** — the supplier's own screen: status badge + editable profile (data + bairros
  multi-select) → `GET/PUT /api/fornecedor` (`fornecedorPublicoDetalhe` / `atualizarFornecedorPublico`).
  **`/fornecedor/senha`** — trocar senha (`PUT /api/fornecedor/senha {atual, nova}` →
  `conferirSenha` on `fornecedorPublicoSenhaHash` then `alterarSenhaFornecedorPublico`); linked from the
  account menu (fornecedores don't get `/perfil` or `/senha`).
- **Catálogo + portfólio do fornecedor (`db/26`)** — `fornecedor_produto` (`fornecedor_publico_id`,
  `nome`, `categoria` free-text with suggestion chips `CATEGORIAS_FORNECEDOR_PRODUTO` in
  `src/lib/fornecedorProduto.ts`, `foto` data-URL kept out of list queries → `tem_foto`, `preco_unidade`
  / `preco_desconto`+`desconto_qtd_min` / `preco_caixa`+`caixa_qtd`, `ordem`). `fornecedor_publico`
  gained `slug` (unique, generated from `nome` on approval / first product / GET `/api/fornecedor`) and
  `portfolio_pdf` (base64, kept out of selects). **`/fornecedor/produtos`** — list-only (produtos
  pattern): grid, name/category filter, `+ Novo produto` → `/fornecedor/produtos/novo` and
  `.../editar/[id]` (shared `<FormularioFornecedorProduto>`), a "📄 Anexar portfólio em PDF" button
  (`PUT/DELETE /api/fornecedor/portfolio-pdf`, multipart, ≤8MB), and the shareable portfolio link.
  Routes: `GET/POST /api/fornecedor/produtos`, `PUT/DELETE .../[id]`, `GET .../[id]/foto`, `POST
  .../melhorar-foto`. **Photo enhancement** — `src/lib/melhorarImagemProduto.ts` posts the picked photo
  to remove.bg (`REMOVEBG_API_KEY`, `bg_color=ffffff` so no server-side compositing); no key / any
  failure → returns the same photo. The form shows a "✨ com fundo branco / foto original" toggle.
  **`/p/[slug]`** — the **public** portfolio page (server component, `revalidate = 300`), added to
  `middleware.ts` as a for-everyone path (before the fornecedor-area lock); `MenuLateral` returns null
  for `/p/`; `.conteudo:has(.pf-pagina)` drops the sidebar margin. Photos/PDF served publicly via
  `/api/portfolio/[slug]/foto/[id]` and `/api/portfolio/[slug]/pdf` (join on slug + `situacao='aprovado'`).
  `listarDiretorioFornecedores` now returns `slug` + `tem_catalogo`; `/diretorio` rows get a "Ver
  catálogo" link to `/p/<slug>`.
- **`/diretorio` (store side)** — `empresa` gained `bairro` (`db/25`, editable in `/configuracoes`
  alongside `cidade`). `GET /api/diretorio?bairro=` (`exigirEmpresa`) → `listarDiretorioFornecedores`
  (approved `fornecedor_publico` in `empresa.cidade`, optionally serving a bairro), defaulting the filter
  to `empresa.bairro`. `POST /api/diretorio/importar {fornecedorPublicoId}` copies the public record into
  the store's own `fornecedor` table via `criarFornecedor`. In the **Cadastros** menu group as "Buscar
  fornecedores".
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
- **Fiado** (`fiado` table: `cliente_id`, `valor`, `descricao`, `pago`, plus `vencimento`/`recorrente`/
  `recorrente_parcelas`/`serie_id` from `db/40`, see the recurring-bills section below) — a payment option
  on `/venda` (that checkout path never sends the recurring fields, they just default false/null) and its
  own "+ Nova conta a receber" form on `/contas`. `/contas` ("Contas a receber") groups open debts by
  client with per-entry "marcar pago" and per-client "quitar tudo" (`quitarFiadoDoCliente` — bulk-pays but
  does **not** top up a recurring buffer immediately, unlike the single-row `marcarFiadoPago`; the next
  day's cron catches up within 24h). `criarFiado` re-checks `cliente.empresa_id` in the INSERT so a
  session can't post to another store's client.

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
"esta conta já está paga" → row inserted `pago_em = now()`) and `recorrente` (`db/18`, buffer logic below).

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

### Recurring bills — buffer of future installments + daily cron (`db/40`)

Both `conta_pagar` and `fiado` support recurrence the same way: a row marked `recorrente` carries
`recorrente_parcelas` (how many **pending** installments the shopkeeper wants always kept generated ahead)
and `serie_id` (points at the **root** row's own id — set via a follow-up `UPDATE ... SET serie_id = id`
right after the INSERT, so every row in a series, including the first, shares one `serie_id` to group by).
This replaced the old conta_pagar behavior of cloning exactly one extra occurrence when you paid a
recorrente bill — now it maintains a **buffer**, not a single lookahead.

`garantirParcelasContaPagar(empresaId, serieId)` / `garantirParcelasFiado(empresaId, serieId)` (`db.ts`) do
the actual math: count unpaid rows in the series (`WHERE serie_id = $1 AND NOT pago` — **not** filtered by
date, so an overdue-but-unpaid installment still counts, it just needs to be paid to free up a buffer
slot), compare to `recorrente_parcelas`, and if short, insert that many new rows, each `vencimento` offset
from `MAX(vencimento)` in the series by `+1, +2, +3…` months (descricao/valor/categoria/fornecedor_id or
cliente_id copied from the series — there's no edit-an-existing-bill flow in this app, so every row in a
series is identical apart from `vencimento`). This function is called from **three** places: right after
creating a recorrente row (`criarContaPagar`/`criarFiado`, to front-load the buffer immediately instead of
waiting for tomorrow), right after `marcarContaPagarPaga`/`marcarFiadoPago` marks one paid (immediate
top-up — the UI toast reports `parcelasGeradas`), and from the daily cron (below), which is the backstop
that catches everything else (including bulk-paid-via-"quitar tudo" fiado, which skips the immediate
top-up on purpose to keep that bulk action simple).

**`recorrente` requires both `vencimento` and `recorrente_parcelas` (≥1)** — enforced in
`POST /api/contas-pagar` and `POST /api/fiado` (400 otherwise), since there's no way to compute the next
occurrence's date without a starting point. For fiado, `vencimento` itself is otherwise optional on **any**
lançamento (recorrente or not) — new field, shown in `/contas`'s "Nova conta a receber" form and in the
list subtitle (`vence dd/mm/aaaa`) alongside a plain "recorrente" text token, same minimal style
`/contas-pagar` already used.

**`GET /api/cron/recorrencias`** (`src/app/api/cron/recorrencias/route.ts`, `maxDuration = 60`) is the
daily job, wired via `vercel.json`'s `"crons": [{ "path": "/api/cron/recorrencias", "schedule": "0 12 * * *" }]`
(12:00 UTC = 09:00 BRT — Brazil has had no DST since 2019, so this doesn't drift). It's gated behind
`CRON_SECRET` (`.env.example`): Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on
scheduled invocations when that env var is set on the project, so the route just compares the header —
unset `CRON_SECRET` → the route 503s rather than silently running unauthenticated. The route calls
`processarRecorrenciasEAlertas()` (`db.ts`), which does two unrelated jobs in one pass since they're both
"once a day, every store" work: (1) finds **every** `serie_id` across **every** empresa with `recorrente`
rows and runs the buffer top-up for each (catches series whose buffer fell behind, e.g. a store that
hasn't opened the app in a while); (2) sends **two separate** notifications per empresa when relevant —
conta_pagar due within that store's configured lead time (see "Lead time + variable-value bills" below),
and fiado due today (`vencimento = CURRENT_DATE AND NOT pago`, no lead-time setting for fiado, always
same-day). Each uses its own `chaveBase` (`conta-pagar-vencimento:<data ISO>` /
`conta-receber-vencimento:<data ISO>`) so re-running the cron the same day (or a retry) can't
double-notify either stream independently. No per-empresa loop needs a session —
`notificarUsuariosDaEmpresa` takes a bare `empresaId` and fans out to every active `usuario` of that store
itself (the same primitive `notificarParceirosSobreCotacao`/`enviarAvisoAdmin` already use for
session-free, cross-store broadcasts).

### Lead time + variable-value recurring bills (`db/41`)

Two contas-pagar-only additions, both configured in a **"⚙️ Configurações"** card at the top of
`/contas-pagar` (collapsed by default, click the heading to expand):

- **`empresa.aviso_dias_contas_pagar`** (integer, default 0) — how many days *before* `vencimento` the
  cron should fire the "conta a pagar vencendo" notification (0 = same-day, the original behavior).
  `avisoDiasContasPagar`/`definirAvisoDiasContasPagar` (`db.ts`) read/write it (clamped 0–90);
  `GET/PUT /api/contas-pagar/configuracoes` exposes it. `processarRecorrenciasEAlertas`'s conta_pagar query
  joins `empresa` and matches `vencimento = CURRENT_DATE + (aviso_dias_contas_pagar || ' days')::interval`
  per row, so each store's lead time is independent — this setting does **not** affect fiado's alert, which
  stays hardcoded same-day (fiado has no equivalent "Configurações" UI yet).
- **`conta_pagar.valor_variavel`** (boolean) — for a recorrente bill whose amount actually changes every
  cycle (água, luz: fixed due day, variable total) rather than being identical across the whole series like
  every other recorrente bill. Set via a checkbox shown only when "recorrente" is checked on
  `/contas-pagar/nova` ("o valor acima é só uma estimativa"); `garantirParcelasContaPagar` propagates it
  (via `bool_or(valor_variavel)` over the series) onto every newly-generated installment, same as
  categoria/fornecedor_id. The `/contas-pagar` grid shows a ✏️ button next to the price on any **unpaid**
  row with `valor_variavel` — click it to swap the price for an inline `<input>` + 💾/✕ (same
  `.editar-estoque` inline-edit pattern `/produtos` uses for stock), `PATCH /api/contas-pagar/:id {valor}`
  → new narrow `atualizarValorContaPagar(empresaId, id, novoValor)` (mirrors `atualizarEstoqueProduto`,
  touches only the `valor` column, blocked once `pago`). This is a **separate action from "Marcar
  pago"** — editing the real amount doesn't also quit the bill; the shopkeeper still clicks pago separately.

**Empréstimos (`/cascos`)** — `casco` table gained `item text` (`db/21`, mirrored) = what the customer
took (engradado, botijão…), now a required field on the form; `criarCasco` and `POST /api/cascos` pass it.

### Passivo — levantamento de bens (`/passivos`, `db/46`)

Menu Cadastros → "Passivo". É o inventário dos bens da empresa que **não são mercadoria** (banca, cofre,
congelador, balcão, equipamentos…): tabela `passivo` (`nome`, `categoria`, `quantidade`, `descricao`,
`valor_estimado` por unidade, `foto` data URL fora das listas → `tem_foto`, `origem` manual|foto|video).
Categorias fixas em `src/lib/passivo.ts` (`CATEGORIAS_PASSIVO`, com ícone e a `dica` que vai no prompt da IA).
- **`/passivos`**: resumo (valor estimado total = Σ valor × qtd; avisa quantos estão sem valor), chips por
  categoria, lista com foto/editar/excluir (`confirm`) e form manual (voz + `CampoFoto`).
- **`/passivos/foto`** (até 8 fotos) e **`/passivos/video`** (`GravadorVideo`, 90 s, 10 quadros amostrados):
  o navegador manda as imagens (data URLs) pra `POST /api/passivos/analisar` → `src/lib/lerPassivoFotos.ts`
  (uma chamada de visão, `ANTHROPIC_MODEL`) → `[{nome, categoria, quantidade, descricao, imagemIndice}]`; o
  `imagemIndice` diz em qual imagem o bem aparece melhor e vira a foto dele. No vídeo o mesmo bem aparece em
  vários quadros — o prompt manda contar uma vez. A conferência é `RevisaoPassivos` (checkbox, nome, categoria,
  qtd, valor, descrição, tudo editável/com voz) → `POST /api/passivos { itens }` (lote, até 60).
- Rotas (`exigirEmpresa`, sempre com `empresa_id` da sessão): `GET/POST /api/passivos`, `PUT/DELETE
  /api/passivos/[id]`, `GET /api/passivos/[id]/foto`, `POST /api/passivos/analisar`. Validação em
  `lerEntradaPassivo` (foto: ausente mantém, `""` remove, data URL troca). Vídeo **não usa a narração**
  (só quadros). Não está no mpmf-desktop (que não tem o módulo Cadastros).
