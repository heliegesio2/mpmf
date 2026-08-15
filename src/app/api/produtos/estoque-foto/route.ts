import { NextResponse } from "next/server";
import { buscarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { extrairEstoqueDasFotos, type ImagemEntrada } from "@/lib/lerEstoqueFoto";

export const dynamic = "force-dynamic";

const LIMIAR_SUGESTAO = 0.5;
const TIPOS_MIDIA = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FOTOS = 6;

/**
 * POST /api/produtos/estoque-foto (multipart, campo "fotos", pode repetir)
 * Le uma ou mais fotos de prateleira, estima a quantidade visivel de cada
 * produto e casa com o catalogo por nome. So propoe produtos ja cadastrados
 * — nao cria produto novo aqui. Nao grava nada, so devolve pra conferencia.
 */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  try {
    const dados = await request.formData();
    const fotos = dados.getAll("fotos").filter((f): f is File => f instanceof File);
    if (fotos.length === 0) {
      return NextResponse.json({ erro: "Envie ao menos uma foto." }, { status: 400 });
    }
    if (fotos.length > MAX_FOTOS) {
      return NextResponse.json({ erro: `Envie no máximo ${MAX_FOTOS} fotos por vez.` }, { status: 400 });
    }
    for (const foto of fotos) {
      if (!TIPOS_MIDIA.has(foto.type)) {
        return NextResponse.json({ erro: "Formato de imagem não suportado." }, { status: 400 });
      }
    }

    const imagens: ImagemEntrada[] = await Promise.all(
      fotos.map(async (foto) => ({
        base64: Buffer.from(await foto.arrayBuffer()).toString("base64"),
        mediaType: foto.type as ImagemEntrada["mediaType"],
      }))
    );

    const itensDetectados = await extrairEstoqueDasFotos(imagens);

    const itens = await Promise.all(
      itensDetectados.map(async (item) => {
        const candidatos = await buscarProduto(empresaId, item.descricao, 1);
        const melhor = candidatos[0];
        const produto =
          melhor && (melhor.score ?? 0) >= LIMIAR_SUGESTAO
            ? { id: melhor.id, nome: melhor.nome, estoqueAtual: Number(melhor.estoque), score: melhor.score }
            : null;

        return {
          descricaoDetectada: item.descricao,
          quantidadeEstimada: item.quantidadeEstimada,
          unidade: item.unidade,
          produto,
        };
      })
    );

    return NextResponse.json({ itens });
  } catch (erro) {
    console.error("Falha ao ler estoque por foto:", erro);
    return NextResponse.json(
      { erro: "Não foi possível ler as fotos. Tente fotos mais nítidas." },
      { status: 500 }
    );
  }
}
