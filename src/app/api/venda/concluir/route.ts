import { NextResponse } from "next/server";
import { baixarEstoqueVenda, registrarVenda } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/venda/concluir
 *   { data, itens: [{ id?, nome, quantidade, precoUnit, tipoVenda }], partes: [{ forma, valor }] }
 *
 * Chamado ao finalizar a venda. Faz duas coisas, ambas não-bloqueantes (a
 * venda já foi cobrada): grava a venda (aparece em /vendas) e dá baixa no
 * estoque. Devolve o estoque restante de cada item (+ se está crítico).
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const corpo = await request.json().catch(() => ({}));

  const data =
    typeof corpo?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpo.data) ? corpo.data : null;

  const itens = (Array.isArray(corpo?.itens) ? corpo.itens : [])
    .map((i: unknown) => {
      const o = (i ?? {}) as Record<string, unknown>;
      return {
        id: Number(o.id),
        nome: String(o.nome ?? "").trim(),
        quantidade: Number(o.quantidade),
        precoUnit: Number(o.precoUnit),
        tipoVenda: String(o.tipoVenda ?? "unidade"),
      };
    })
    .filter((i: { quantidade: number; precoUnit: number }) => i.quantidade > 0 && i.precoUnit >= 0);

  const partes = (Array.isArray(corpo?.partes) ? corpo.partes : [])
    .map((p: unknown) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { forma: String(o.forma ?? ""), valor: Number(o.valor) };
    })
    .filter((p: { valor: number }) => p.valor > 0);

  let vendaId: number | null = null;
  try {
    vendaId = await registrarVenda(empresaId, {
      data,
      itens: itens.map((i: { id: number; nome: string; quantidade: number; precoUnit: number; tipoVenda: string }) => ({
        id: Number.isInteger(i.id) ? i.id : null,
        nome: i.nome || "Item",
        quantidade: i.quantidade,
        precoUnit: i.precoUnit,
        tipoVenda: i.tipoVenda,
      })),
      partes,
    });
  } catch (e) {
    console.error("Falha ao registrar a venda:", e);
  }

  let estoques: Record<number, { estoque: number; critico: boolean }> = {};
  try {
    estoques = await baixarEstoqueVenda(
      empresaId,
      itens
        .map((i: { id: number; quantidade: number }) => ({ id: i.id, quantidade: i.quantidade }))
        .filter((i: { id: number }) => Number.isInteger(i.id))
    );
  } catch (e) {
    console.error("Falha ao baixar o estoque da venda:", e);
  }

  return NextResponse.json({ ok: true, vendaId, estoques });
}
