import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { salvarMercadoPagoEmpresa } from "@/lib/db";
import { origemApp } from "@/lib/oauth";
import { redirectUriMP, trocarCodigoMP } from "@/lib/mercadopago";
import { sessaoAtual } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/mercadopago/callback -> volta do Mercado Pago, salva o token da loja. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = origemApp(request);

  const falhar = (motivo: string) => {
    const r = NextResponse.redirect(new URL(`/configuracoes?mpErro=${encodeURIComponent(motivo)}`, base));
    r.cookies.set("mp_oauth_state", "", { path: "/", maxAge: 0 });
    return r;
  };

  const sessao = await sessaoAtual();
  if (!sessao?.empresaId) return NextResponse.redirect(new URL("/login", base));

  if (url.searchParams.get("error")) return falhar("acesso-negado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get("mp_oauth_state")?.value;
  if (!code || !state || cookieState !== state) return falhar("sessao-expirada");

  try {
    const tok = await trocarCodigoMP(code, redirectUriMP(request));
    await salvarMercadoPagoEmpresa(sessao.empresaId, tok);
  } catch (e) {
    console.error("Mercado Pago OAuth callback:", e);
    return falhar("falha-no-mercado-pago");
  }

  const r = NextResponse.redirect(new URL("/configuracoes?mp=conectado", base));
  r.cookies.set("mp_oauth_state", "", { path: "/", maxAge: 0 });
  return r;
}
