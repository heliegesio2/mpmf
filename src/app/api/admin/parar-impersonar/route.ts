import { NextResponse } from "next/server";
import { usuarioPorId } from "@/lib/db";
import { COOKIE_SESSAO, criarToken } from "@/lib/auth";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/parar-impersonar
 *
 * Volta da sessão "entrar como" para o super admin de verdade. Não exige
 * super admin (a sessão atual é a do usuário assumido) — a autorização vem do
 * campo `origem` do token, que só /api/admin/impersonar consegue assinar.
 */
export async function POST() {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  if (!sessao.origem) {
    return NextResponse.json({ erro: "Esta sessão não é um 'entrar como'." }, { status: 400 });
  }

  const admin = await usuarioPorId(sessao.origem.usuarioId);
  if (!admin || !admin.ativo || admin.papel !== "super_admin") {
    // super admin sumiu/desativado: encerra a sessão por segurança
    const resp = NextResponse.json({ erro: "Faça login de novo.", destino: "/login" }, { status: 401 });
    resp.cookies.set(COOKIE_SESSAO, "", { path: "/", maxAge: 0 });
    return resp;
  }

  const { token, expiraEm } = await criarToken({
    usuarioId: admin.id,
    nome: admin.nome,
    papel: admin.papel,
    empresaId: admin.empresa_id,
    empresaNome: admin.empresa_nome,
  });

  console.warn(`[impersonar] ${admin.nome} (#${admin.id}) voltou ao painel`);

  const resp = NextResponse.json({ ok: true, destino: "/admin/empresas" });
  resp.cookies.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiraEm,
  });
  return resp;
}
