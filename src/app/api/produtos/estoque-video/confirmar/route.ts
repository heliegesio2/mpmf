import { NextResponse } from "next/server";
import {
  atualizarEstoqueProduto,
  atualizarFotoProduto,
  atualizarPrecoProduto,
  criarProduto,
} from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type ItemConfirmado = {
  // produto já cadastrado: atualiza estoque e/ou preço (o que vier)
  produtoId?: number;
  novoEstoque?: number;
  novoPreco?: number;
  // produto novo:
  nome?: string;
  estoque?: number;
  preco?: number;
  tipoVenda?: string;
  unidade?: string;
  /** quadro do vídeo (data URL) pra virar a foto do produto — opcional */
  foto?: string;
};

const num0 = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const numPos = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const fotoValida = (v: unknown): v is string =>
  typeof v === "string" && /^data:image\/(jpe?g|png|webp);base64,/.test(v) && v.length < 3_000_000;

/**
 * POST /api/produtos/estoque-video/confirmar { itens: ItemConfirmado[] }
 * Com "produtoId": atualiza o estoque e/ou o preço (o que for enviado) + foto.
 * Sem: cria produto novo (preço de compra 0).
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
        let atual = null;
        if (num0(item.novoEstoque)) {
          atual = await atualizarEstoqueProduto(empresaId, item.produtoId, item.novoEstoque);
        }
        if (numPos(item.novoPreco)) {
          atual = await atualizarPrecoProduto(empresaId, item.produtoId, item.novoPreco);
        }
        if (fotoValida(item.foto)) {
          await atualizarFotoProduto(empresaId, item.produtoId, item.foto).catch(() => {});
        }
        if (!atual) {
          return NextResponse.json(
            { erro: `Nada pra atualizar (ou produto ${item.produtoId} não encontrado).` },
            { status: 400 }
          );
        }
        resultados.push(atual);
        continue;
      }

      const nome = String(item.nome ?? "").trim();
      if (nome.length < 2) {
        return NextResponse.json({ erro: "Produto novo sem nome válido." }, { status: 400 });
      }
      if (!numPos(item.preco)) {
        return NextResponse.json({ erro: `Informe um preço válido para "${nome}".` }, { status: 400 });
      }

      const criado = await criarProduto(empresaId, {
        nome,
        unidade: item.unidade || "unidade",
        tipoVenda: item.tipoVenda || "unidade",
        preco: item.preco,
        precoCompra: 0,
        estoque: num0(item.estoque) ? item.estoque : 0,
        ...(fotoValida(item.foto) ? { foto: item.foto } : {}),
      });
      resultados.push(criado);
    }

    return NextResponse.json({ itens: resultados });
  } catch (erro) {
    console.error("Falha ao confirmar estoque por vídeo:", erro);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
