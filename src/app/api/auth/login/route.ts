import { NextResponse } from "next/server";
import { usuarioPorEmail } from "@/lib/db";
import { COOKIE_SESSAO, criarToken } from "@/lib/auth";
import { conferirSenha } from "@/lib/senha";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, senha } = await request.json();

    if (!email || !senha) {
      return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
    }

    const usuario = await usuarioPorEmail(String(email));

    // mesma mensagem para e-mail inexistente e senha errada:
    // dizer qual dos dois falhou entrega quais e-mails existem
    const negar = () =>
      NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });

    if (!usuario || !usuario.ativo) return negar();
    if (!(await conferirSenha(String(senha), usuario.senha_hash))) return negar();

    if (usuario.papel !== "super_admin") {
      if (usuario.empresa_situacao === "pendente") {
        return NextResponse.json(
          { erro: "A empresa ainda está aguardando aprovação." },
          { status: 403 }
        );
      }
      if (usuario.empresa_situacao === "reprovada") {
        return NextResponse.json(
          { erro: "O cadastro desta empresa foi reprovado." },
          { status: 403 }
        );
      }
    }

    const { token, expiraEm } = await criarToken({
      usuarioId: usuario.id,
      nome: usuario.nome,
      papel: usuario.papel,
      empresaId: usuario.empresa_id,
      empresaNome: usuario.empresa_nome,
    });

    const resposta = NextResponse.json({
      nome: usuario.nome,
      papel: usuario.papel,
      empresaNome: usuario.empresa_nome,
      destino: usuario.papel === "super_admin" ? "/admin/empresas" : "/",
    });

    resposta.cookies.set(COOKIE_SESSAO, token, {
      httpOnly: true,                                   // o JavaScript da página não lê
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiraEm,
    });

    return resposta;
  } catch (erro) {
    console.error("Falha no login:", erro);
    return NextResponse.json({ erro: "Não foi possível entrar agora." }, { status: 500 });
  }
}
