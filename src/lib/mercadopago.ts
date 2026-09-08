/**
 * Pix automático via Mercado Pago Connect (OAuth Authorization Code) — na mão,
 * como o resto do auth do app (ver src/lib/oauth.ts). Cada loja conecta a
 * PRÓPRIA conta Mercado Pago: o dinheiro do Pix cai direto nela, nunca numa
 * conta central da plataforma. O client_id/client_secret aqui são só da
 * aplicação usada para o handshake OAuth — não movem dinheiro sozinhos.
 */

import { mercadoPagoDaEmpresa, salvarMercadoPagoEmpresa, type MercadoPagoEmpresa } from "@/lib/db";
import { origemApp } from "@/lib/oauth";

const AUTH_URL = "https://auth.mercadopago.com/authorization";
const TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const PAGAMENTOS_URL = "https://api.mercadopago.com/v1/payments";

const CLIENT_ID = process.env.MP_CLIENT_ID;
const CLIENT_SECRET = process.env.MP_CLIENT_SECRET;

export function configuradoMP(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function redirectUriMP(req: Request): string {
  return `${origemApp(req)}/api/mercadopago/callback`;
}

export function urlAutorizacaoMP(redirect: string, state: string): string {
  const q = new URLSearchParams({
    client_id: CLIENT_ID!,
    response_type: "code",
    platform_id: "mp",
    redirect_uri: redirect,
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export type TokenMP = {
  mpUserId: string;
  accessToken: string;
  refreshToken: string;
  expiraEm: Date;
};

function tokenDaResposta(d: Record<string, unknown>): TokenMP {
  return {
    mpUserId: String(d.user_id ?? ""),
    accessToken: String(d.access_token ?? ""),
    refreshToken: String(d.refresh_token ?? ""),
    expiraEm: new Date(Date.now() + Number(d.expires_in ?? 0) * 1000),
  };
}

export async function trocarCodigoMP(code: string, redirect: string): Promise<TokenMP> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      code,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  const d = (await r.json()) as Record<string, unknown>;
  if (!r.ok || !d.access_token) {
    throw new Error(`token: ${d.message || d.error_description || d.error || r.status}`);
  }
  const tok = tokenDaResposta(d);
  if (!tok.mpUserId) throw new Error("Mercado Pago não retornou o identificador da conta.");
  return tok;
}

export async function renovarTokenMP(refreshToken: string): Promise<TokenMP> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const d = (await r.json()) as Record<string, unknown>;
  if (!r.ok || !d.access_token) {
    throw new Error(`renovação: ${d.message || d.error_description || d.error || r.status}`);
  }
  return tokenDaResposta(d);
}

/** Garante um access_token válido pra empresa, renovando se estiver perto de vencer. */
export async function tokenValidoMP(empresaId: number): Promise<MercadoPagoEmpresa | null> {
  const mp = await mercadoPagoDaEmpresa(empresaId);
  if (!mp) return null;

  const prestesAVencer = mp.expiraEm.getTime() - Date.now() < 24 * 3600 * 1000;
  if (!prestesAVencer) return mp;

  const novo = await renovarTokenMP(mp.refreshToken);
  await salvarMercadoPagoEmpresa(empresaId, novo);
  return { empresaId, ativo: mp.ativo, ...novo };
}

export type PagamentoPix = {
  id: number;
  qrCode: string;
  status: string;
};

/** Cria uma cobrança Pix na conta CONECTADA da loja (accessToken já é o dela). */
export async function criarPagamentoPix(opts: {
  accessToken: string;
  valor: number;
  descricao: string;
  txid: string;
  payerEmail: string;
}): Promise<PagamentoPix> {
  const r = await fetch(PAGAMENTOS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.accessToken}`,
      // muda se o valor mudar: evita o Mercado Pago recusar por reuso de chave
      "X-Idempotency-Key": `${opts.txid}-${Math.round(opts.valor * 100)}`,
    },
    body: JSON.stringify({
      transaction_amount: opts.valor,
      description: opts.descricao,
      payment_method_id: "pix",
      external_reference: opts.txid,
      payer: { email: opts.payerEmail },
    }),
  });
  const d = (await r.json()) as Record<string, any>;
  if (!r.ok) throw new Error(d?.message || `mercado pago (${r.status})`);
  const qrCode = d?.point_of_interaction?.transaction_data?.qr_code;
  if (!qrCode) throw new Error("Mercado Pago não retornou o QR do Pix.");
  return { id: d.id, qrCode, status: d.status };
}

export async function statusPagamentoPix(accessToken: string, id: number | string): Promise<string> {
  const r = await fetch(`${PAGAMENTOS_URL}/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const d = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(d?.message ?? `mercado pago (${r.status})`));
  return String(d.status ?? "");
}
