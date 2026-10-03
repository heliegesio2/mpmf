import { NextResponse } from "next/server";
import { excluirVenda } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** DELETE /api/vendas/:id -> exclui a venda (com log de quem excluiu) e devolve o estoque. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { empresaId, sessao, erro } = await exigirEmpresa();
  if (erro) return erro;

  const { id } = await ctx.params;
  const vendaId = Number(id);
  if (!Number.isInteger(vendaId) || vendaId <= 0) {
    return NextResponse.json({ erro: "Venda inválida." }, { status: 400 });
  }

  try {
    const nome = sessao.origem ? `${sessao.nome} (via ${sessao.origem.nome})` : sessao.nome;
    const r = await excluirVenda(empresaId, vendaId, { id: sessao.usuarioId, nome });
    if (r === "nao_encontrada") {
      return NextResponse.json({ erro: "Venda não encontrada." }, { status: 404 });
    }
    if (r === "nota_emitida") {
      return NextResponse.json(
        { erro: "Essa venda tem NFC-e autorizada. Cancele a nota antes de excluir." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao excluir venda:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível excluir a venda.", detalhe }, { status: 500 });
  }
}
