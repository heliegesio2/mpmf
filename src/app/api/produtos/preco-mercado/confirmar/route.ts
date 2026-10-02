import { NextResponse } from "next/server";
import { atualizarPrecoProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type ItemConfirmado = { produtoId: number; novoPreco: number };

function numeroValido(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * POST /api/produtos/preco-mercado/confirmar { itens: [{produtoId, novoPreco}] }
 * Grava o preco de venda sugerido (preco medio de mercado + percentual) em
 * cada produto — so mexe no preco, igual a atualizacao de preco por video.
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
    for (const item of itens) {
      if (!numeroValido(item.produtoId) || !numeroValido(item.novoPreco)) {
        return NextResponse.json({ erro: "Item com dados inválidos." }, { status: 400 });
      }
    }

    const resultados = await Promise.all(
      itens.map((item) => atualizarPrecoProduto(empresaId, item.produtoId, item.novoPreco))
    );

    return NextResponse.json({ itens: resultados });
  } catch (erro) {
    console.error("Falha ao salvar preços de mercado:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json(
      { erro: "Não foi possível salvar os preços.", detalhe },
      { status: 500 }
    );
  }
}
