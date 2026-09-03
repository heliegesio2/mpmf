import { NextResponse } from "next/server";
import { fornecedorPublicoPorEmail, usuarioPorEmail } from "@/lib/db";
import { COOKIE_SESSAO, criarToken } from "@/lib/auth";
import { conferirSenha } from "@/lib/senha";
import { autorizarLogin } from "@/lib/login";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, senha } = await request.json();

    if (!email || !senha) {
      return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
    }

    const usuario = await usuarioPorEmail(String(email));

    // mesma mensagem para e-mail inexistente e senha errada:
    // dizer qual dos dois falhou entrega quais e-mails existem.
    // O motivo real vai só pro log do servidor (nunca na resposta).
    const negar = (motivo: string) => {
      console.warn(`Login negado (${motivo}):`, email);
      return NextResponse.json({ erro: "E-mail ou senha incorretos." }, { status: 401 });
    };

    // não é usuário de loja? pode ser um fornecedor com cadastro público.
    if (!usuario) {
      const forn = await fornecedorPublicoPorEmail(String(email));
      if (forn) {
        if (forn.situacao === "pendente") {
          return NextResponse.json(
            { erro: "Seu cadastro de fornecedor está aguardando aprovação." },
            { status: 403 }
          );
        }
        if (forn.situacao === "reprovado") {
          return NextResponse.json(
            {
              erro:
                "Seu cadastro de fornecedor não foi aprovado." +
                (forn.motivo ? ` Motivo: ${forn.motivo}` : ""),
            },
            { status: 403 }
          );
        }
        if (!forn.senha_hash || !(await conferirSenha(String(senha), forn.senha_hash))) {
          return negar("senha de fornecedor incorreta");
        }
        const { token, expiraEm } = await criarToken({
          usuarioId: 0,
          nome: forn.nome,
          papel: "fornecedor",
          empresaId: null,
          empresaNome: null,
          fornecedorId: forn.id,
        });
        const resp = NextResponse.json({ nome: forn.nome, papel: "fornecedor", destino: "/fornecedor" });
        resp.cookies.set(COOKIE_SESSAO, token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          expires: expiraEm,
        });
        return resp;
      }
      return negar("e-mail nao cadastrado");
    }
    if (!usuario.ativo) return negar("usuario inativo");
    // conta só de rede social não tem senha
    if (!usuario.senha_hash) {
      return NextResponse.json(
        { erro: "Esta conta entra pelo Google ou Facebook." },
        { status: 401 }
      );
    }
    if (!(await conferirSenha(String(senha), usuario.senha_hash))) return negar("senha incorreta");

    const r = await autorizarLogin(usuario);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status });

    const resposta = NextResponse.json({
      nome: r.nome,
      papel: r.papel,
      empresaNome: r.empresaNome,
      destino: r.destino,
    });
    resposta.cookies.set(COOKIE_SESSAO, r.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: r.expiraEm,
    });
    return resposta;
  } catch (erro) {
    console.error("Falha no login:", erro);
    return NextResponse.json({ erro: "Não foi possível entrar agora." }, { status: 500 });
  }
}
