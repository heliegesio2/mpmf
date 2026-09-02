import { NextResponse } from "next/server";
import { alterarNomeUsuario } from "@/lib/db";
import { COOKIE_SESSAO, criarToken } from "@/lib/auth";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** PUT /api/auth/perfil { nome } -> troca o próprio nome e regrava a sessão. */
export async function PUT(request: Request) {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  try {
    const { nome } = await request.json();
    const limpo = String(nome ?? "").trim();
    if (limpo.length < 2) {
      return NextResponse.json({ erro: "Informe o nome." }, { status: 400 });
    }

    await alterarNomeUsuario(sessao.usuarioId, limpo);

    // o nome fica dentro do token da sessão — regrava o cookie pra o menu atualizar
    const { token, expiraEm } = await criarToken({
      usuarioId: sessao.usuarioId,
      nome: limpo,
      papel: sessao.papel,
      empresaId: sessao.empresaId,
      empresaNome: sessao.empresaNome,
    });

    const resposta = NextResponse.json({ nome: limpo });
    resposta.cookies.set(COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiraEm,
    });
    return resposta;
  } catch (e) {
    console.error("Falha ao salvar o perfil:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
