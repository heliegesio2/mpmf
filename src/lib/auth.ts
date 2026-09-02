/**
 * Sessão sem biblioteca externa: cookie assinado com HMAC via Web Crypto,
 * que funciona tanto nas rotas de API quanto no middleware (Edge Runtime).
 *
 * Hash de senha (scrypt, exige "node:crypto") fica em src/lib/senha.ts,
 * que não pode ser importado por este arquivo — o middleware importa
 * auth.ts e roda no Edge, que não empacota módulos node:crypto.
 */

export type Papel = "super_admin" | "admin" | "operador";

export type Sessao = {
  usuarioId: number;
  nome: string;
  papel: Papel;
  empresaId: number | null;
  empresaNome: string | null;
  /** Expiração em segundos desde 1970. */
  exp: number;
};

const DURACAO_HORAS = 12;
export const COOKIE_SESSAO = "sessao";

function segredo(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) {
    throw new Error(
      "Defina SESSION_SECRET no .env.local com pelo menos 24 caracteres."
    );
  }
  return s;
}

// ---------- codificação segura para cookie ----------

function paraBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function chaveHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ---------- sessão ----------

export async function criarToken(
  dados: Omit<Sessao, "exp">
): Promise<{ token: string; expiraEm: Date }> {
  const exp = Math.floor(Date.now() / 1000) + DURACAO_HORAS * 3600;
  const corpo = paraBase64Url(
    new TextEncoder().encode(JSON.stringify({ ...dados, exp }))
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    await chaveHmac(),
    new TextEncoder().encode(corpo)
  );
  return {
    token: `${corpo}.${paraBase64Url(new Uint8Array(assinatura))}`,
    expiraEm: new Date(exp * 1000),
  };
}

export async function lerToken(token?: string | null): Promise<Sessao | null> {
  if (!token) return null;
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;

  try {
    const valida = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(),
      deBase64Url(assinatura),
      new TextEncoder().encode(corpo)
    );
    if (!valida) return null;

    const sessao: Sessao = JSON.parse(
      new TextDecoder().decode(deBase64Url(corpo))
    );
    if (sessao.exp * 1000 < Date.now()) return null;
    return sessao;
  } catch {
    return null;
  }
}

// ---------- cadastro social pendente ----------
// Identidade verificada (Google/Facebook) de quem ainda não tem conta: fica
// num cookie curto assinado até a pessoa preencher os dados da loja.
export const COOKIE_CADASTRO_SOCIAL = "cadastro_social";

export type CadastroSocial = {
  provedor: "google" | "facebook";
  provedorId: string;
  email: string;
  nome: string;
  /** URL da foto no provedor (curta — o data URL não caberia no cookie). */
  fotoUrl?: string;
  exp: number;
};

async function assinar(corpo: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    "HMAC",
    await chaveHmac(),
    new TextEncoder().encode(corpo)
  );
  return `${corpo}.${paraBase64Url(new Uint8Array(sig))}`;
}

export async function criarCadastroSocial(
  dados: Omit<CadastroSocial, "exp">,
  duracaoMinutos = 20
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + duracaoMinutos * 60;
  const corpo = paraBase64Url(
    new TextEncoder().encode(JSON.stringify({ ...dados, exp }))
  );
  return assinar(corpo);
}

export async function lerCadastroSocial(token?: string | null): Promise<CadastroSocial | null> {
  if (!token) return null;
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;
  try {
    const valida = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(),
      deBase64Url(assinatura),
      new TextEncoder().encode(corpo)
    );
    if (!valida) return null;
    const dados: CadastroSocial = JSON.parse(
      new TextDecoder().decode(deBase64Url(corpo))
    );
    if (dados.exp * 1000 < Date.now()) return null;
    return dados;
  } catch {
    return null;
  }
}
