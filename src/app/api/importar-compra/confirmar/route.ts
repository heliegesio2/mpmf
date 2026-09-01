import { NextResponse } from "next/server";
import { atualizarProduto, criarProduto, produtoPorId } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type ItemConfirmado = {
  produtoId?: number;
  nome?: string;
  categoria?: string | null;
  unidade?: string;
  tipoVenda?: string;
  precoCompra: number;
  precoVenda: number;
};

function numeroValido(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * POST /api/importar-compra/confirmar { itens: ItemConfirmado[] }
 *
 * Cada item ou tem "produtoId" (atualiza preco_compra/preco de um produto
 * existente, preservando os demais campos) ou vem sem produtoId (cria um
 * produto novo). O estoque nao e alterado aqui — a importacao so mexe em
 * preco.
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
      if (!numeroValido(item.precoCompra) || !numeroValido(item.precoVenda)) {
        return NextResponse.json({ erro: "Item com preço inválido." }, { status: 400 });
      }

      if (item.produtoId) {
        const atual = await produtoPorId(empresaId, item.produtoId);
        if (!atual) {
          return NextResponse.json(
            { erro: `Produto ${item.produtoId} não encontrado.` },
            { status: 404 }
          );
        }
        const atualizado = await atualizarProduto(empresaId, item.produtoId, {
          nome: atual.nome,
          categoria: atual.categoria,
          local: atual.local,
          unidade: atual.unidade,
          tipoVenda: atual.tipo_venda,
          preco: item.precoVenda,
          precoCompra: item.precoCompra,
          estoque: Number(atual.estoque),
          // preserva o aviso de estoque baixo e o preço da embalagem já configurados
          estoqueMinimo: atual.estoque_minimo === null ? null : Number(atual.estoque_minimo),
          estoqueMinimoEmbalagem: atual.estoque_minimo_embalagem,
          precoEmbalagem: atual.preco_embalagem === null ? null : Number(atual.preco_embalagem),
        });
        resultados.push(atualizado);
      } else {
        const nome = String(item.nome ?? "").trim();
        if (nome.length < 2) {
          return NextResponse.json({ erro: "Produto novo sem nome válido." }, { status: 400 });
        }
        const criado = await criarProduto(empresaId, {
          nome,
          categoria: item.categoria ?? null,
          unidade: item.unidade ?? "unidade",
          tipoVenda: item.tipoVenda ?? "unidade",
          preco: item.precoVenda,
          precoCompra: item.precoCompra,
          estoque: 0,
        });
        resultados.push(criado);
      }
    }

    return NextResponse.json({ itens: resultados });
  } catch (erro) {
    console.error("Falha ao confirmar importação de compra:", erro);
    return NextResponse.json({ erro: "Não foi possível salvar os itens." }, { status: 500 });
  }
}
