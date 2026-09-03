import { NextResponse } from "next/server";
import { alterarSenhaFornecedorPublico, fornecedorPublicoSenhaHash } from "@/lib/db";
import { conferirSenha, gerarHashSenha } from "@/lib/senha";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** PUT /api/fornecedor/senha { atual, nova } -> o fornecedor troca a própria senha. */
export async function PUT(request: Request) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const { atual, nova } = await request.json();
    const novaSenha = String(nova ?? "");

    const hash = await fornecedorPublicoSenhaHash(fornecedorId);
    if (!hash) return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });

    if (!(await conferirSenha(String(atual ?? ""), hash))) {
      return NextResponse.json({ erro: "A senha atual está incorreta." }, { status: 400 });
    }
    if (novaSenha.length < 8) {
      return NextResponse.json({ erro: "A nova senha precisa ter ao menos 8 caracteres." }, { status: 400 });
    }

    await alterarSenhaFornecedorPublico(fornecedorId, await gerarHashSenha(novaSenha));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao trocar a senha do fornecedor:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
