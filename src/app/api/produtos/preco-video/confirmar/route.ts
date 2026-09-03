import { NextResponse } from "next/server";
import { atualizarFotoProduto, atualizarPrecoProduto, criarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type ItemConfirmado = {
  // produto já cadastrado: atualiza só o preço
  produtoId?: number;
  novoPreco?: number;
  // produto novo: cria com o preço falado no vídeo (estoque 0, preço de compra 0)
  nome?: string;
  preco?: number;
  tipoVenda?: string;
  unidade?: string;
  /** quadro do vídeo (data URL) pra virar a foto do produto — opcional */
  foto?: string;
};

const precoValido = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

const fotoValida = (v: unknown): v is string =>
  typeof v === "string" && /^data:image\/(jpe?g|png|webp);base64,/.test(v) && v.length < 3_000_000;

/**
 * POST /api/produtos/preco-video/confirmar { itens: ItemConfirmado[] }
 * Com "produtoId": troca só o preço de venda. Sem: cria produto novo
 * (estoque 0, preço de compra 0 — ajustáveis depois em Produtos).
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
        if (!precoValido(item.novoPreco)) {
          return NextResponse.json({ erro: "Item com preço inválido." }, { status: 400 });
        }
        const atualizado = await atualizarPrecoProduto(empresaId, item.produtoId, item.novoPreco);
        if (!atualizado) {
          return NextResponse.json(
            { erro: `Produto ${item.produtoId} não encontrado.` },
            { status: 404 }
          );
        }
        if (fotoValida(item.foto)) {
          await atualizarFotoProduto(empresaId, item.produtoId, item.foto).catch(() => {});
        }
        resultados.push(atualizado);
        continue;
      }

      const nome = String(item.nome ?? "").trim();
      if (nome.length < 2) {
        return NextResponse.json({ erro: "Produto novo sem nome válido." }, { status: 400 });
      }
      if (!precoValido(item.preco)) {
        return NextResponse.json({ erro: `Informe um preço válido para "${nome}".` }, { status: 400 });
      }

      const criado = await criarProduto(empresaId, {
        nome,
        unidade: item.unidade || "unidade",
        tipoVenda: item.tipoVenda || "unidade",
        preco: item.preco,
        precoCompra: 0,
        estoque: 0,
        ...(fotoValida(item.foto) ? { foto: item.foto } : {}),
      });
      resultados.push(criado);
    }

    return NextResponse.json({ itens: resultados });
  } catch (erro) {
    console.error("Falha ao confirmar preço por vídeo:", erro);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
