import { NextResponse } from "next/server";
import { excluirCliente } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/clientes/:id */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Cliente inválido." }, { status: 400 });
  }

  try {
    const removeu = await excluirCliente(empresaId, id);
    if (!removeu) return NextResponse.json({ erro: "Cliente não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao excluir cliente:", e);
    return NextResponse.json({ erro: "Não foi possível excluir." }, { status: 500 });
  }
}
