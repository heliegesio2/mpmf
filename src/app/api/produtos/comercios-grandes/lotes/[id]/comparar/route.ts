import { NextResponse } from "next/server";
import { compararLoteParaEmpresa } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/produtos/comercios-grandes/lotes/:id/comparar
 * Recompara os itens desse lote (de qualquer loja) com o MEU catálogo —
 * botão "Comparar preços" no card do feed compartilhado.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Lançamento inválido." }, { status: 400 });
  }
  try {
    const itens = await compararLoteParaEmpresa(empresaId, id);
    return NextResponse.json({ itens });
  } catch (e) {
    console.error("Falha ao comparar o lançamento:", e);
    return NextResponse.json({ erro: "Não foi possível comparar." }, { status: 500 });
  }
}
