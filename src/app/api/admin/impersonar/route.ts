import { NextResponse } from "next/server";
import { usuarioPorId } from "@/lib/db";
import { COOKIE_SESSAO, criarToken } from "@/lib/auth";
import { exigirSuperAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/impersonar  { usuarioId }
 *
 * "Entrar como" — o super admin assume a sessão de um usuário de empresa sem
 * saber a senha dele. O token novo guarda em `origem` quem é o super admin de
 * verdade, para o botão "voltar ao painel" (ver /api/admin/parar-impersonar).
 * Só o super admin chega aqui; o token é assinado, então `origem` não dá pra forjar.
 */
export async function POST(request: Request) {
  const { sessao, erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const { usuarioId } = await request.json().catch(() => ({}));
  const id = Number(usuarioId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Usuário inválido." }, { status: 400 });
  }

  const alvo = await usuarioPorId(id);
  if (!alvo) {
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  }
  if (!alvo.ativo) {
    return NextResponse.json({ erro: "Esse usuário está desativado." }, { status: 409 });
  }
  if (alvo.papel === "super_admin") {
    return NextResponse.json({ erro: "Não dá para entrar como outro super admin." }, { status: 409 });
  }
  if (!alvo.empresa_id) {
    return NextResponse.json({ erro: "Esse usuário não tem empresa." }, { status: 409 });
  }

  const { token, expiraEm } = await criarToken({
    usuarioId: alvo.id,
    nome: alvo.nome,
    papel: alvo.papel,
    empresaId: alvo.empresa_id,
    empresaNome: alvo.empresa_nome,
    origem: { usuarioId: sessao.usuarioId, nome: sessao.nome },
  });

  console.warn(
    `[impersonar] ${sessao.nome} (#${sessao.usuarioId}) entrou como ${alvo.nome} (#${alvo.id}, empresa ${alvo.empresa_nome ?? alvo.empresa_id})`
  );

  const resp = NextResponse.json({ ok: true, destino: "/", nome: alvo.nome });
  resp.cookies.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiraEm,
  });
  return resp;
}
