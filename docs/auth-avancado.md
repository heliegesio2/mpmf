# Auth avançado (landing, impersonação, login social)

Trecho movido do CLAUDE.md (referenciado por lá).

**Landing pública em `/`** — quando **não há sessão**, `middleware.ts` faz `rewrite` de `/` para
`public/landing.html` (a landing page do PDV Já — fonte em `../site/index.html`, um HTML autocontido com
`<style>`/`<script>` inline, canvas de partículas e animação de digitação; regenerar com o mesmo wrapper
`<!doctype>` + trocar `href="https://pdvja.com.br/"` por `/cadastro`). Com sessão, `/` é a tela de
consulta de preço (`src/app/page.tsx`) como sempre. A landing tem no topo **Entrar** (`/login`) ao lado
de **Cadastre-se** (`/cadastro`).

**"Entrar como" (impersonation)** — `/admin/empresas` has an *Entrar como* button per store user.
`POST /api/admin/impersonar {usuarioId}` (`exigirSuperAdmin`) mints a session token *for that user* with
an extra signed `origem: {usuarioId, nome}` claim (the super admin's real identity — can't be forged, the
token is HMAC-signed) and swaps the `sessao` cookie. The super admin then uses the store exactly as that
user (blocked from `/admin/*` like any non-admin). `MenuLateral` shows a `.faixa-impersonar` banner while
`sessao.origem` is set; its button calls `POST /api/admin/parar-impersonar`, which authorises off the
`origem` claim (not `exigirSuperAdmin`, since the current session is the impersonated user), re-checks
that origem user is still an active super admin, and mints a clean super-admin token. `Sessao.origem` in
`auth.ts`; `/api/auth/sessao` echoes it.

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
