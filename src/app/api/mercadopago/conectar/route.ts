import { NextResponse } from "next/server";
import { configuradoMP, redirectUriMP, urlAutorizacaoMP } from "@/lib/mercadopago";
import { sessaoAtual } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * GET /api/mercadopago/conectar -> redireciona pro consentimento do Mercado
 * Pago. Navegação de página normal (link em /configuracoes), não fetch — por
 * isso os erros aqui viram redirect em vez de JSON.
 */
export async function GET(request: Request) {
  const sessao = await sessaoAtual();
  if (!sessao?.empresaId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!configuradoMP()) {
    return NextResponse.redirect(new URL("/configuracoes?mpErro=nao-configurado", request.url));
  }

  const state = crypto.randomUUID();
  const destino = urlAutorizacaoMP(redirectUriMP(request), state);

  const resposta = NextResponse.redirect(destino);
  resposta.cookies.set("mp_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return resposta;
}
