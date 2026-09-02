import { NextResponse } from "next/server";
import { baixarEstoqueVenda } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/venda/baixar-estoque  { itens: [{ id, quantidade }] }
 *
 * Chamado ao concluir a venda: subtrai do estoque de cada produto a
 * quantidade vendida. Não há livro de vendas — isto é o único registro
 * que a venda deixa. Nunca deixa o estoque negativo.
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const corpo = await request.json().catch(() => ({}));
    const brutos = Array.isArray(corpo?.itens) ? corpo.itens : [];
    const itens = brutos
      .map((i: unknown) => {
        const o = (i ?? {}) as Record<string, unknown>;
        return { id: Number(o.id), quantidade: Number(o.quantidade) };
      })
      .filter((i: { id: number; quantidade: number }) => Number.isInteger(i.id) && i.quantidade > 0);

    await baixarEstoqueVenda(empresaId, itens);
    return NextResponse.json({ ok: true, baixados: itens.length });
  } catch (e) {
    console.error("Falha ao baixar estoque da venda:", e);
    return NextResponse.json({ erro: "Não foi possível dar baixa no estoque." }, { status: 500 });
  }
}
