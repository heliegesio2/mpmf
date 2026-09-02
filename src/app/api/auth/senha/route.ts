import { NextResponse } from "next/server";
import { usuarioPorId, alterarSenhaUsuario } from "@/lib/db";
import { conferirSenha, gerarHashSenha } from "@/lib/senha";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/auth/senha -> diz se a conta tem senha (contas só-Google não têm). */
export async function GET() {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  const usuario = await usuarioPorId(sessao.usuarioId);
  return NextResponse.json({ temSenha: Boolean(usuario?.senha_hash) });
}

/** PUT /api/auth/senha { atual, nova } -> troca a própria senha. */
export async function PUT(request: Request) {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  try {
    const { atual, nova } = await request.json();
    const novaSenha = String(nova ?? "");

    const usuario = await usuarioPorId(sessao.usuarioId);
    if (!usuario) return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });

    if (!usuario.senha_hash) {
      return NextResponse.json(
        { erro: "Esta conta entra pelo Google ou Facebook e não usa senha." },
        { status: 400 }
      );
    }
    if (!(await conferirSenha(String(atual ?? ""), usuario.senha_hash))) {
      return NextResponse.json({ erro: "A senha atual está incorreta." }, { status: 400 });
    }
    if (novaSenha.length < 8) {
      return NextResponse.json({ erro: "A nova senha precisa ter ao menos 8 caracteres." }, { status: 400 });
    }

    await alterarSenhaUsuario(sessao.usuarioId, await gerarHashSenha(novaSenha));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao trocar a senha:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
