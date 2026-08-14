import { NextResponse } from "next/server";
import { alterarSenhaUsuario } from "@/lib/db";
import { gerarHashSenha } from "@/lib/senha";
import { exigirSuperAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** PATCH /api/usuarios/:id { senha } -> troca a senha de um usuário (só super admin). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Usuário inválido." }, { status: 400 });
  }

  try {
    const { senha } = await request.json();
    if (String(senha ?? "").length < 8) {
      return NextResponse.json({ erro: "A senha precisa ter ao menos 8 caracteres." }, { status: 400 });
    }

    const ok = await alterarSenhaUsuario(id, await gerarHashSenha(senha));
    if (!ok) return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao trocar senha:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
