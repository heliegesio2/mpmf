import { NextResponse } from "next/server";
import { alterarPerfilUsuario, fotoUsuario } from "@/lib/db";
import { COOKIE_SESSAO, criarToken } from "@/lib/auth";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/auth/perfil -> nome atual + se já tem foto. */
export async function GET() {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  const foto = await fotoUsuario(sessao.usuarioId);
  return NextResponse.json({ nome: sessao.nome, temFoto: Boolean(foto) });
}

/** PUT /api/auth/perfil { nome, foto? } -> troca nome/foto e regrava a sessão. */
export async function PUT(request: Request) {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  try {
    const corpo = await request.json();
    const limpo = String(corpo?.nome ?? "").trim();
    if (limpo.length < 2) {
      return NextResponse.json({ erro: "Informe o nome." }, { status: 400 });
    }

    // foto: só mexe se a chave veio no corpo. "" remove; data URL troca.
    let foto: string | undefined;
    if (Object.prototype.hasOwnProperty.call(corpo, "foto")) {
      foto = String(corpo.foto ?? "");
      if (foto && !foto.startsWith("data:image/")) {
        return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
      }
    }

    await alterarPerfilUsuario(sessao.usuarioId, limpo, foto);

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
