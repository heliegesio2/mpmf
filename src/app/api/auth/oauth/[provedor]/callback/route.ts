import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_CADASTRO_SOCIAL,
  COOKIE_SESSAO,
  criarCadastroSocial,
} from "@/lib/auth";
import { autorizarLogin } from "@/lib/login";
import {
  definirFotoUsuarioSeVazia,
  usuarioPorEmail,
  usuarioPorIdentidade,
  vincularIdentidade,
} from "@/lib/db";
import {
  baixarFotoComoDataUrl,
  origemApp,
  provedorValido,
  redirectUri,
  trocarCodigo,
} from "@/lib/oauth";

export const dynamic = "force-dynamic";

const prod = process.env.NODE_ENV === "production";

/** GET /api/auth/oauth/:provedor/callback -> volta do provedor, entra ou vai pro cadastro. */
export async function GET(request: Request, { params }: { params: Promise<{ provedor: string }> }) {
  const p = (await params).provedor;
  const url = new URL(request.url);
  const base = origemApp(request);

  const falhar = (motivo: string) => {
    const r = NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(motivo)}`, base));
    r.cookies.set("oauth_state", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (!provedorValido(p)) return falhar("provedor-invalido");
  if (url.searchParams.get("error")) return falhar("acesso-negado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = (await cookies()).get("oauth_state")?.value;
  if (!code || !state || cookieState !== `${p}:${state}`) return falhar("sessao-expirada");

  let perfil;
  try {
    perfil = await trocarCodigo(p, code, redirectUri(request, p));
  } catch (e) {
    console.error("OAuth callback:", e);
    return falhar("falha-no-provedor");
  }

  // 1. identidade já vinculada?
  let usuario = await usuarioPorIdentidade(p, perfil.provedorId);
  // 2. senão, e-mail já tem conta -> vincula a identidade
  if (!usuario) {
    const porEmail = await usuarioPorEmail(perfil.email);
    if (porEmail) {
      await vincularIdentidade(porEmail.id, p, perfil.provedorId);
      usuario = porEmail;
    }
  }

  if (usuario) {
    // pega a foto do provedor na primeira vez (não sobrescreve foto própria)
    if (perfil.fotoUrl) {
      try {
        const dataUrl = await baixarFotoComoDataUrl(perfil.fotoUrl);
        if (dataUrl) await definirFotoUsuarioSeVazia(usuario.id, dataUrl);
      } catch (e) {
        console.warn("foto social:", e);
      }
    }

    const r = await autorizarLogin(usuario);
    if (!r.ok) return falhar(r.erro);
    const resp = NextResponse.redirect(new URL(r.destino, base));
    resp.cookies.set(COOKIE_SESSAO, r.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: prod,
      path: "/",
      expires: r.expiraEm,
    });
    resp.cookies.set("oauth_state", "", { path: "/", maxAge: 0 });
    return resp;
  }

  // 3. conta nova -> guarda a identidade verificada e manda pro cadastro da loja
  const token = await criarCadastroSocial({
    provedor: p,
    provedorId: perfil.provedorId,
    email: perfil.email,
    nome: perfil.nome,
    fotoUrl: perfil.fotoUrl || undefined,
  });
  const resp = NextResponse.redirect(new URL("/cadastro?social=1", base));
  resp.cookies.set(COOKIE_CADASTRO_SOCIAL, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: prod,
    path: "/",
    maxAge: 20 * 60,
  });
  resp.cookies.set("oauth_state", "", { path: "/", maxAge: 0 });
  return resp;
}
