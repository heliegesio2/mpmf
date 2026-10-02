import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/sessao";
import { buscarPrecoMedioMercado, MAX_PRODUTOS_POR_LOTE, type ProdutoConsulta } from "@/lib/precoMercado";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** produto.id e bigint — o pg devolve como texto, entao o id chega aqui como number ou string. */
function idValido(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return v.trim() !== "" && Number.isFinite(Number(v));
  return false;
}

/**
 * POST /api/produtos/preco-mercado { produtos: [{id, nome}] }
 *
 * Pesquisa o preco medio de mercado de cada produto (via busca na web) —
 * nao grava nada, so devolve pra conferencia. Limitado a MAX_PRODUTOS_POR_LOTE
 * por chamada pra nao estourar o tempo da funcao; sobrando produtos, a tela
 * pede pra rodar de novo depois.
 */
export async function POST(request: Request) {
  const { erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  try {
    const corpo = (await request.json()) as { produtos?: { id?: unknown; nome?: unknown }[] };
    const produtos: ProdutoConsulta[] = (corpo.produtos ?? [])
      .filter((p) => idValido(p?.id) && typeof p?.nome === "string" && p.nome.trim().length >= 2)
      .map((p) => ({ id: Number(p.id), nome: String(p.nome).trim() }));
    if (produtos.length === 0) {
      return NextResponse.json({ erro: "Nenhum produto para pesquisar." }, { status: 400 });
    }
    if (produtos.length > MAX_PRODUTOS_POR_LOTE) {
      return NextResponse.json(
        { erro: `Envie no máximo ${MAX_PRODUTOS_POR_LOTE} produtos por vez.` },
        { status: 400 }
      );
    }

    const itens = await buscarPrecoMedioMercado(produtos);
    return NextResponse.json({ itens });
  } catch (erro) {
    console.error("Falha ao pesquisar preço médio de mercado:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json(
      { erro: "Não foi possível pesquisar os preços.", detalhe },
      { status: 500 }
    );
  }
}
