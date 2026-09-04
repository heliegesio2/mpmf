import { NextResponse } from "next/server";
import { notaCompraDetalhe } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/importar-compra/notas/:id -> a nota + todos os itens que ela trouxe. */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Nota inválida." }, { status: 400 });
  }
  try {
    const item = await notaCompraDetalhe(empresaId, id);
    if (!item) return NextResponse.json({ erro: "Nota não encontrada." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao carregar a nota de compra:", e);
    return NextResponse.json({ erro: "Não foi possível carregar." }, { status: 500 });
  }
}
