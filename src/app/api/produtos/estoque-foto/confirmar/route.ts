import { NextResponse } from "next/server";
import { atualizarEstoqueProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type ItemConfirmado = { produtoId: number; novoEstoque: number };

/**
 * POST /api/produtos/estoque-foto/confirmar { itens: ItemConfirmado[] }
 * Atualiza so o campo estoque de produtos ja existentes.
 */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  try {
    const corpo = (await request.json()) as { itens?: ItemConfirmado[] };
    const itens = corpo.itens ?? [];
    if (itens.length === 0) {
      return NextResponse.json({ erro: "Nenhum item para salvar." }, { status: 400 });
    }

    const resultados = [];
    for (const item of itens) {
      if (!item.produtoId || !Number.isFinite(item.novoEstoque) || item.novoEstoque < 0) {
        return NextResponse.json({ erro: "Item com estoque inválido." }, { status: 400 });
      }
      const atualizado = await atualizarEstoqueProduto(empresaId, item.produtoId, item.novoEstoque);
      if (!atualizado) {
        return NextResponse.json(
          { erro: `Produto ${item.produtoId} não encontrado.` },
          { status: 404 }
        );
      }
      resultados.push(atualizado);
    }

    return NextResponse.json({ itens: resultados });
  } catch (erro) {
    console.error("Falha ao confirmar estoque por foto:", erro);
    return NextResponse.json({ erro: "Não foi possível salvar o estoque." }, { status: 500 });
  }
}
