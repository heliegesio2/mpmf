import { NextResponse } from "next/server";
import { configurado, provedorValido, redirectUri, urlAutorizacao } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** GET /api/auth/oauth/:provedor -> redireciona pro consentimento do provedor. */
export async function GET(request: Request, { params }: { params: Promise<{ provedor: string }> }) {
  const p = (await params).provedor;
  const erro = (motivo: string) =>
    NextResponse.redirect(new URL(`/login?erro=${motivo}`, request.url));

  if (!provedorValido(p)) return erro("provedor-invalido");
  if (!configurado(p)) return erro("provedor-nao-configurado");

  const state = crypto.randomUUID();
  const destino = urlAutorizacao(p, redirectUri(request, p), state);

  const resposta = NextResponse.redirect(destino);
  resposta.cookies.set("oauth_state", `${p}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return resposta;
}
