import { NextResponse } from "next/server";
import { buscarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { extrairItensDoCupom } from "@/lib/importarCompra";

export const dynamic = "force-dynamic";

const MARGEM_VENDA = 0.38;
const LIMIAR_SUGESTAO = 0.5;

const TIPOS_MIDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

function calcularPrecoVenda(precoCompra: number): number {
  return Math.round(precoCompra * (1 + MARGEM_VENDA) * 100) / 100;
}

/**
 * POST /api/importar-compra (multipart, campo "foto")
 * Le a foto do cupom, extrai os itens e sugere o produto correspondente ja
 * cadastrado (por nome). Nao grava nada — so devolve a lista pra conferencia.
 */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  try {
    const dados = await request.formData();
    const foto = dados.get("foto");
    if (!(foto instanceof File)) {
      return NextResponse.json({ erro: "Envie a foto do cupom." }, { status: 400 });
    }
    if (!TIPOS_MIDIA.has(foto.type)) {
      return NextResponse.json({ erro: "Formato de imagem não suportado." }, { status: 400 });
    }

    const bytes = Buffer.from(await foto.arrayBuffer());
    const base64 = bytes.toString("base64");

    const itensExtraidos = await extrairItensDoCupom(base64, foto.type as "image/jpeg" | "image/png" | "image/webp");

    const itens = await Promise.all(
      itensExtraidos.map(async (item) => {
        const candidatos = await buscarProduto(empresaId, item.descricao, 1);
        const melhor = candidatos[0];
        const sugestao =
          melhor && (melhor.score ?? 0) >= LIMIAR_SUGESTAO
            ? { id: melhor.id, nome: melhor.nome, score: melhor.score }
            : null;

        return {
          descricaoExtraida: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
          precoCompra: item.valorUnitario,
          precoVendaSugerido: calcularPrecoVenda(item.valorUnitario),
          produtoSugerido: sugestao,
        };
      })
    );

    return NextResponse.json({ itens });
  } catch (erro) {
    console.error("Falha ao importar cupom:", erro);
    return NextResponse.json(
      { erro: "Não foi possível ler o cupom. Tente uma foto mais nítida." },
      { status: 500 }
    );
  }
}
