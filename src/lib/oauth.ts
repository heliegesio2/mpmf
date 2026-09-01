/**
 * OAuth 2.0 (Authorization Code) na mão para Google e Facebook. Sem biblioteca,
 * como o resto do auth do app. As rotas em src/app/api/auth/oauth/ usam isto.
 */

export type ProvedorNome = "google" | "facebook";

type Config = {
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
  parseUserinfo: (u: Record<string, unknown>) => { provedorId: string; email: string; nome: string };
};

export const PROVEDORES: Record<ProvedorNome, Config> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    parseUserinfo: (u) => ({
      provedorId: String(u.sub ?? ""),
      email: String(u.email ?? ""),
      nome: String(u.name ?? u.email ?? ""),
    }),
  },
  facebook: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    userinfoUrl: "https://graph.facebook.com/me?fields=id,name,email",
    scope: "email",
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    parseUserinfo: (u) => ({
      provedorId: String(u.id ?? ""),
      email: String(u.email ?? ""),
      nome: String(u.name ?? u.email ?? ""),
    }),
  },
};

export function provedorValido(p: string): p is ProvedorNome {
  return p === "google" || p === "facebook";
}

export function configurado(p: ProvedorNome): boolean {
  const c = PROVEDORES[p];
  return Boolean(c.clientId && c.clientSecret);
}

/** Origem canônica (APP_URL, ou a do próprio pedido). */
export function origemApp(req: Request): string {
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

export function redirectUri(req: Request, p: string): string {
  return `${origemApp(req)}/api/auth/oauth/${p}/callback`;
}

export function urlAutorizacao(p: ProvedorNome, redirect: string, state: string): string {
  const c = PROVEDORES[p];
  const q = new URLSearchParams({
    client_id: c.clientId!,
    redirect_uri: redirect,
    response_type: "code",
    scope: c.scope,
    state,
  });
  if (p === "google") {
    q.set("access_type", "online");
    q.set("prompt", "select_account");
  }
  return `${c.authUrl}?${q.toString()}`;
}

export async function trocarCodigo(
  p: ProvedorNome,
  code: string,
  redirect: string
): Promise<{ provedorId: string; email: string; nome: string }> {
  const c = PROVEDORES[p];

  const tr = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: c.clientId!,
      client_secret: c.clientSecret!,
      code,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  const tok = (await tr.json()) as Record<string, string>;
  if (!tr.ok || !tok.access_token) {
    throw new Error(
      `token (${p}): ${tok.error_description || tok.error || tr.status}`
    );
  }

  const ur = await fetch(c.userinfoUrl, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const u = (await ur.json()) as Record<string, unknown>;
  if (!ur.ok) throw new Error(`userinfo (${p}): ${ur.status}`);

  const dados = c.parseUserinfo(u);
  if (!dados.provedorId) throw new Error(`${p} não retornou o identificador da conta.`);
  if (!dados.email) throw new Error(`${p} não retornou o e-mail — revise as permissões do app.`);
  return dados;
}
