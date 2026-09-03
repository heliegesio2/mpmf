import { NextResponse } from "next/server";
import {
  atualizarProduto,
  criarProduto,
  notaCompraExistente,
  produtoPorId,
  registrarNotaCompra,
} from "@/lib/db";
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

type NotaEntrada = {
  hashImagem?: string;
  chave?: string | null;
  numero?: string | null;
  emitente?: string | null;
};

function numeroValido(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * POST /api/importar-compra/confirmar { itens: ItemConfirmado[], nota?: NotaEntrada }
 *
 * Cada item ou tem "produtoId" (atualiza preco_compra/preco de um produto
 * existente, preservando os demais campos) ou vem sem produtoId (cria um
 * produto novo). O estoque nao e alterado aqui — a importacao so mexe em
 * preco. Ao final registra a nota (hash da imagem + chave de acesso) pra
 * reconhecer um reenvio.
 */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  try {
    const corpo = (await request.json()) as { itens?: ItemConfirmado[]; nota?: NotaEntrada };
    const itens = corpo.itens ?? [];
    if (itens.length === 0) {
      return NextResponse.json({ erro: "Nenhum item para salvar." }, { status: 400 });
    }

    // valida tudo antes de criar/atualizar qualquer coisa
    for (const item of itens) {
      if (!numeroValido(item.precoCompra) || !numeroValido(item.precoVenda)) {
        return NextResponse.json({ erro: "Item com preço inválido." }, { status: 400 });
      }
      if (!item.produtoId && String(item.nome ?? "").trim().length < 2) {
        return NextResponse.json({ erro: "Produto novo sem nome válido." }, { status: 400 });
      }
    }

    const hashImagem = String(corpo.nota?.hashImagem ?? "").trim() || null;
    const chave = String(corpo.nota?.chave ?? "").replace(/\D/g, "") || null;

    // reenvio da mesma nota já confirmada
    if (hashImagem) {
      const jaFeita = await notaCompraExistente(empresaId, hashImagem, chave);
      if (jaFeita) {
        const quando = new Date(jaFeita.criado_em).toLocaleDateString("pt-BR");
        return NextResponse.json(
          { jaProcessada: true, quando, aviso: `Essa nota já foi processada em ${quando}.` },
          { status: 409 }
        );
      }
    }

    const resultados = [];
    for (const item of itens) {
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
        const criado = await criarProduto(empresaId, {
          nome: String(item.nome ?? "").trim(),
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

    if (hashImagem) {
      await registrarNotaCompra(empresaId, {
        hashImagem,
        chave,
        numero: String(corpo.nota?.numero ?? "").trim() || null,
        emitente: String(corpo.nota?.emitente ?? "").trim() || null,
        itens: resultados.length,
      });
    }

    return NextResponse.json({ itens: resultados });
  } catch (erro) {
    console.error("Falha ao confirmar importação de compra:", erro);
    return NextResponse.json({ erro: "Não foi possível salvar os itens." }, { status: 500 });
  }
}
