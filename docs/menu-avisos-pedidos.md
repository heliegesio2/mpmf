# Menu, anotações, avisos, notificações e pedidos

Trecho movido do CLAUDE.md (referenciado por lá).

### Sino de avisos (notification bell) — moved off the profile photo

`MenuLateral`'s unread-count badge used to be a small `.conta-badge` absolutely-positioned over the
top-right corner of `.conta-topo` (the profile photo button) — functional, but the two tap targets
overlapped, making the profile menu and the avisos dropdown compete for the same corner. It's now a fully
separate `.sino-avisos` button (fixed, `right: 214px`, same 40×40 icon-button style as `.atalho-busca`/
`.atalho-venda-direta`) with a bell SVG, rendered **unconditionally** (not just when there's something
unread) so the avisos dropdown is always reachable from the top bar; the red `.sino-avisos-contador` count
only shows when `avisosNaoLidos > 0`. Same `abrirAvisos()` handler and `.avisos-menu` dropdown as before —
only the trigger button changed.

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
🛒 Balcão (`/`, `/venda`, `/vendas`, `/caixa`) · 📦 Produtos (`/produtos`, `/compras/importar`) · 💰
Financeiro (`/contas-pagar`, `/contas`, `/custos` — labeled **"Investimentos"**) · 👥 Cadastros
(`/clientes`, `/fornecedores`, `/cascos` — labeled **"Empréstimos"**) · 📊 Relatórios (direct link) ·
📝 Anotações (direct link, shows a red `.menu-alerta` count from `GET /api/anotacoes/alertas`) · 🏢
Administração (`/admin/empresas`, super-admin only). Routes and DB tables keep their old names
(`/custos`/`custo`, `/cascos`/`casco`) — only the user-facing labels/headers changed.
`gruposAbertos` is a `Set<string>` — "balcao" plus the group holding the current path start open;
navigating opens the new path's group without closing the others. When adding a route, add it to a
group's `itens`, not a flat list.

**Anotações (`/anotacoes`, `db/22`)** — `anotacao (texto, data_alerta date null, concluida)` +
`foto` (`db/29`, data URL, out of `CAMPOS_ANOTACAO` → `tem_foto`; bytes at `GET /api/anotacoes/:id/foto`,
add/replace at `PUT`). Create (`<CampoTextoRico>` + mic + optional `<input type=date>` + `<CampoFoto>`),
toggle done, edit the alert date inline, delete. `GET/POST /api/anotacoes`, `GET/PATCH/DELETE
/api/anotacoes/:id` (`anotacaoPorId`/`editarAnotacao`/`excluirAnotacao`). `anotacoesEmAlerta` counts open
notes with `data_alerta <= CURRENT_DATE` for the menu badge (`GET /api/anotacoes/alertas`). List sorts
overdue → today → future → undated, with filter tabs Abertas/Concluídas/Todas plus a **super-admin-only**
"Aviso da administração" tab (`situacao=administracao` → `WHERE de_admin`, shown only when `souSuperAdmin`
— it's how the sender reviews their own broadcasts, since `enviarAvisoAdmin` always CCs them). **Photo is
read** (`src/lib/lerFotoAnotacao.ts` → `POST /api/anotacoes/interpretar-foto` → `{nome}`): written text
is transcribed, a list becomes `- ` lines, a bare product becomes "marca + tipo + peso"; the result is
appended to the note's `texto` as `<br>` + escaped text (in the form via `<CampoFoto aoIdentificarNome>`
+ `urlIdentificar`; on the inline add-photo via a `PATCH`).

**`/anotacoes/[id]`** — the detail screen a notification actually opens into (see below): title, the
`texto` rendered as HTML, the photo, the alert date, the concluir checkbox, and (not `de_admin`) delete.
When the anotação carries its own `link` (see the admin-aviso section), a **"🔗 Clique aqui para conferir
a novidade"** button appears and `router.push`es there — a deliberate two-step: land on the note's own
content first, then optionally go on to whatever it's about.

**`texto` is HTML, not plain text** (`<CampoTextoRico>`, `src/components/CampoTextoRico.tsx`) — a
`contentEditable` box (no library: `document.execCommand("bold"/"italic"/"insertUnorderedList")` from a
3-button toolbar) that also **pastes a screenshot inline**: `onPaste` checks `clipboardData.items` for an
`image/*` entry, compresses it with `comprimirParaDataURL` (`maxLado:1000, qualidade:0.7`) and
`execCommand("insertImage", …)`s it into the content at the cursor — the saved `texto` is genuinely
`<p>…</p><img src="data:...">` HTML. The DOM only re-syncs from the `valor` prop while the box is
*not* focused (a `focado` ref), the usual guard against a controlled contentEditable eating its own
cursor position. Voice transcripts append as `escapeHtml(texto)` (never raw). The server-side length cap
went from 2000 to **300,000 chars** (`LIMITE_TEXTO` in each of `POST/PATCH /api/anotacoes[/:id]` and
`POST /api/admin/avisos`) since one pasted image alone can be tens of KB of base64. The list renders
`a.texto` via `dangerouslySetInnerHTML` (`.html-aviso` class) for **every** anotação now (not just
admin ones) — same-tenant trust: worst case one employee's HTML/script only ever reaches a coworker at
the same store, `empresa_id`-scoped like everything else here.

**Aviso repetido a cada 2 dias (`db/33`)** — `sincronizarAvisosDeAnotacoes` (called at the top of `GET
/api/notificacoes`) used to materialize an aviso once per anotação/usuário (idempotent by `chave`) and
never again. Now it also **resurrects** it: `notificacao.lida_em` (set in `marcarNotificacaoLida`/
`marcarTodasLidas`) lets a second query reset `lida=false, lida_em=NULL, criado_em=now()` on that same
row when it's been read for **≥ 2 days** and the anotação is still open and due — so the bell pings again
every 2 days until the shopkeeper marks the note `concluida` or deletes it (either stops the cycle: a
concluded note drops out of the `WHERE NOT concluida` in both queries, and `excluirAnotacao` removes the
`notificacao` rows too).

**Avisos do super admin (`db/33`–`35`)** — "Enviar como aviso para lojas" lives **inside `/anotacoes`'s
"Nova anotação" card itself**, not a separate flow to hunt for: a checkbox shown only when `GET
/api/auth/sessao` says `papel === "super_admin"` (fetched client-side on mount) flips the same form
(same `<CampoTextoRico>`, mic, `<CampoFoto>`, date field) into broadcast mode, adding two more required-
ish fields: **título** (`<CampoVoz>`, required — becomes the notification's `titulo` instead of the
auto "Aviso da administração: " + truncated text) and **link** (`<CampoVoz>`, optional path into the
system, e.g. `/produtos/comercios-grandes`; server keeps only values starting with `/`, never an
external URL). The **notification's own `link` is always `/anotacoes/<id>`** now (the detail screen,
below) — `anotacao.link` is separate data the detail screen reads to render its own "conferir a
novidade" button, so clicking a notification always lands on the note's title+content first, one step
before wherever `link` points. Plus "Enviar para
todos os clientes" (default on; unchecked shows a store search hitting `GET
/api/empresas?situacao=aprovada&q=`) and the existing date field becomes "Quando avisar (vazio =
imediato)". Submitting in that mode posts to `POST /api/admin/avisos` instead of `POST /api/anotacoes`.
**`/admin/avisos`** (Administração menu) is the same composer as its own standalone page — same
components, same endpoint — for a super admin who navigates there directly instead; neither is more
canonical, they just both exist. `POST /api/admin/avisos` (`exigirSuperAdmin`) doesn't invent new
delivery plumbing — `enviarAvisoAdmin` just calls `criarAnotacao(empresaId, texto, dataAlerta, foto,
deAdmin=true, titulo, link)` once per target store (`empresaId` given, or every `situacao='aprovada'`
store when "todos" is checked, **plus always the sender's own `sessao.empresaId`** — a super admin
running a store always gets a copy of their own broadcast, so they can check how it rendered before/
after telling others), reusing the entire existing anotação/aviso chain (bell badge, dropdown,
`/notificacoes`, `/anotacoes`) — a "scheduled" send is just a future `data_alerta` that the existing
due-date sync fires on its own.

`anotacao.de_admin` marks these: the store **cannot edit or delete** them (`editarAnotacao` silently
drops `texto`/`dataAlerta` changes when `de_admin`, `concluida` still works; `excluirAnotacao` returns
`"bloqueada"` → 403) — the only action is the existing "concluir" checkbox. The `/anotacoes` list shows a
`.selo` "aviso da administração" badge on them.

**A de_admin message can additionally arrive as a hand-authored HTML block** (an admin who knows what
they're doing can paste raw markup into `<CampoTextoRico>` same as anyone) — `notificacao.html` (set to
`de_admin`'s value when `sincronizarAvisosDeAnotacoes` materializes the row) tells `/notificacoes` to
render `corpo` via `dangerouslySetInnerHTML` too. The bell dropdown/`titulo` preview strips tags
(`regexp_replace(texto, '<[^>]*>', '', 'g')`) since that's a plain-text-only surface.

**Messageria / avisos (`db/27`)** — `notificacao` targets **exactly one** of `usuario_id` /
`fornecedor_publico_id` (`tipo`, `titulo`, `corpo`, `link`, `chave` for idempotency, `lida`, `criado_em`).
`src/lib/db.ts` messageria group: `notificar(destino, {...})` (`INSERT … ON CONFLICT (…, chave) WHERE
chave IS NOT NULL DO NOTHING`), `notificarUsuariosDaEmpresa(empresaId, …, chaveBase)` (one row per active
user), `listarNotificacoes` / `contarNaoLidas` / `marcarNotificacaoLida` / `marcarTodasLidas`, and
`sincronizarAvisosDeAnotacoes(usuarioId, empresaId)` — lazily materializes one aviso per **due open
anotação** per user (`chave = anotacao:<id>:<usuario_id>`), run at the top of `GET /api/notificacoes`
(incl. `?resumo=1`). `editarAnotacao` deletes the still-unread avisos of a note when it's marked
`concluida`. `Destino` type + `destinoDaSessao(sessao)` (`src/lib/destinoNotificacao.ts`) — fornecedor →
`{fornecedorId}`, else `{usuarioId}` (super-admin-with-no-store → no inbox). Routes: `GET
/api/notificacoes[?resumo=1]`, `PATCH /api/notificacoes/[id] {lida}`, `POST /api/notificacoes/marcar-todas`.
**`/notificacoes`** — the avisos screen (newest first, unread = `--azul-wash` + `.aviso-ponto`, tap marks
read + follows `link`, "marcar todas como lidas"); in the loja menu as "🔔 Avisos" and in
`GRUPO_FORNECEDOR`; `middleware.ts` lets `papel === "fornecedor"` reach it (`compartilhada`). `MenuLateral`
polls `/api/notificacoes?resumo=1` per path and shows a standalone **`.sino-avisos`** bell button (top bar,
`right: 214px`, same fixed-icon style as `.atalho-busca`/`.atalho-venda-direta` — deliberately **not**
overlaid on `.conta-topo`'s profile photo anymore, so the tap target doesn't compete with opening the
account menu) + the menu's `.menu-alerta`; the bell always renders (so the dropdown is reachable even with
zero unread) and shows a red `.sino-avisos-contador` count only when `avisosNaoLidos > 0`. Tapping it opens
the `.avisos-menu` dropdown (Facebook-style: last 8 from `GET /api/notificacoes`, tap one → mark read +
follow `link`, "marcar todas", "Ver todos" → `/notificacoes`). Push/e-mail is **not** part of this — it's
in-app only, per user.

**Pedidos loja→fornecedor (`db/28`)** — `pedido` (`empresa_id`, `fornecedor_publico_id`,
`criado_por_usuario_id`, `status` novo|visto|atendido|cancelado, `observacao`, `motivo`, `total`) +
`pedido_item` (snapshot `nome`/`unidade` un|caixa/`qtd`/`preco_unit`/`subtotal`). `src/lib/pedido.ts`
(pure): `precoAplicavel(produto, unidade, qtd)` (un → `preco_desconto` se `qtd >= desconto_qtd_min`,
senão `preco_unidade`; caixa → `preco_caixa`), `proximoStatusValido(atual, acao, quem)`, `quando(iso)`
(rótulo relativo, reusado no dropdown e na tela de avisos). `db.ts` pedidos group: `criarPedido`
(transação, `FOR SHARE` no `fornecedor_produto`, congela preço/nome), `listarPedidosDoFornecedor`
(`ORDER BY criado_em DESC`, `json_agg` itens + join `empresa`), `listarPedidosDaLoja`, `pedidoDetalhe(id,
escopo)` (escopo `{fornecedorId}` **ou** `{empresaId}` — dono sempre no `WHERE`), `mudarStatusPedido`.
**Loja**: `/diretorio` ganha "Solicitar produto" → **`/pedido/[slug]`** (catálogo do fornecedor com qtd
un/caixa por produto + observação → `POST /api/pedidos` → notifica o fornecedor); **`/pedidos`**
(list-only, mais novo primeiro, cancela enquanto `novo`) no menu Cadastros. Rotas loja (`exigirEmpresa`):
`GET/POST /api/pedidos`, `GET/PATCH /api/pedidos/[id]`, `GET /api/pedidos/catalogo/[slug]`.
**Fornecedor**: **`/fornecedor/pedidos`** (abas novos/atendidos/todos, marca visto/atendido/cancelado c/
motivo → notifica a loja via `notificarUsuariosDaEmpresa`) no `GRUPO_FORNECEDOR`. Rotas
(`exigirFornecedor`): `GET /api/fornecedor/pedidos?situacao=`, `GET/PATCH /api/fornecedor/pedidos/[id]`.

`GET/PUT /api/auth/perfil` — PUT takes `{nome, foto?}` (`foto` tri-state: key absent = keep, `""` = clear,
data URL = replace, same convention as `atualizarProduto`) and re-mints the session cookie so the new name
shows without re-login (the name lives inside the HMAC token); the `/perfil` page then does a full reload
so the menu picks up the new photo. `GET/PUT /api/auth/senha` — `conferirSenha` on the current password
first; Google-only accounts (`senha_hash IS NULL`) get a "no password" message instead of the form.
