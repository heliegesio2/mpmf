import { NextResponse } from "next/server";
import { excluirCusto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** DELETE /api/custos/:id -> exclui um gasto da empresa logada. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Gasto inválido." }, { status: 400 });
  }

  try {
    const removeu = await excluirCusto(empresaId, id);
    if (!removeu) return NextResponse.json({ erro: "Gasto não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao excluir custo:", e);
    return NextResponse.json({ erro: "Não foi possível excluir o gasto." }, { status: 500 });
  }
}
