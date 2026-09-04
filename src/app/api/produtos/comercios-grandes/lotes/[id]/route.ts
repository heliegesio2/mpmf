import { NextResponse } from "next/server";
import { loteDetalhe } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/produtos/comercios-grandes/lotes/:id -> data, quem lançou e os produtos daquele lançamento. */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ erro: "Lançamento inválido." }, { status: 400 });
  }
  try {
    const item = await loteDetalhe(empresaId, id);
    if (!item) return NextResponse.json({ erro: "Lançamento não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao carregar o lançamento:", e);
    return NextResponse.json({ erro: "Não foi possível carregar." }, { status: 500 });
  }
}
