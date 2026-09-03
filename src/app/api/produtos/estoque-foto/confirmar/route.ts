import { NextResponse } from "next/server";
import { atualizarEstoqueProduto, criarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type ItemConfirmado = {
  // produto ja cadastrado: atualiza so o estoque
  produtoId?: number;
  novoEstoque?: number;
  // produto novo: cria com o preco falado/digitado na tela
  nome?: string;
  unidade?: string;
  tipoVenda?: string;
  precoCompra?: number;
  preco?: number;
  estoque?: number;
};

function numeroValido(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * POST /api/produtos/estoque-foto/confirmar { itens: ItemConfirmado[] }
 *
 * Com "produtoId": atualiza so o campo estoque de um produto existente.
 * Sem "produtoId": cria um produto novo com o estoque visto na foto e o
 * preco informado na tela (a foto de prateleira nao revela o preco de
 * compra, entao preco_compra entra como 0 — ajustavel depois em Produtos).
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
      if (item.produtoId) {
        if (!numeroValido(item.novoEstoque)) {
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
        continue;
      }

      const nome = String(item.nome ?? "").trim();
      if (nome.length < 2) {
        return NextResponse.json({ erro: "Produto novo sem nome válido." }, { status: 400 });
      }
      if (!numeroValido(item.preco) || item.preco <= 0) {
        return NextResponse.json({ erro: `Informe um preço válido para "${nome}".` }, { status: 400 });
      }
      if (!numeroValido(item.estoque)) {
        return NextResponse.json({ erro: `Informe um estoque válido para "${nome}".` }, { status: 400 });
      }

      const criado = await criarProduto(empresaId, {
        nome,
        unidade: item.unidade || "unidade",
        tipoVenda: item.tipoVenda || "unidade",
        preco: item.preco,
        precoCompra: numeroValido(item.precoCompra) ? item.precoCompra : 0,
        estoque: item.estoque,
      });
      resultados.push(criado);
    }

    return NextResponse.json({ itens: resultados });
  } catch (erro) {
    console.error("Falha ao confirmar estoque por foto:", erro);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
