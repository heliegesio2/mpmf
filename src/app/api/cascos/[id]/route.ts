import { NextResponse } from "next/server";
import { excluirCasco, marcarCascoDevolvido } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/cascos/:id -> marca o empréstimo como devolvido. */
export async function PATCH(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Registro inválido." }, { status: 400 });
  }

  try {
    const item = await marcarCascoDevolvido(empresaId, id);
    if (!item) return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao marcar casco devolvido:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}

/** DELETE /api/cascos/:id -> exclui o registro. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Registro inválido." }, { status: 400 });
  }

  try {
    const removeu = await excluirCasco(empresaId, id);
    if (!removeu) return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao excluir casco:", e);
    return NextResponse.json({ erro: "Não foi possível excluir." }, { status: 500 });
  }
}
