import { NextResponse } from "next/server";
import { buscarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { lerPrecosDoVideo, transcricaoConfigurada } from "@/lib/lerPrecoVideo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIMIAR_SUGESTAO = 0.5;
const MAX_BYTES = 4.4 * 1024 * 1024;

/**
 * POST /api/produtos/preco-video  (multipart, campo "audio" = WAV extraído do vídeo)
 *
 * Transcreve a fala, tira dela a lista de { nome, preço } e casa cada nome com
 * o catálogo. Não grava nada — devolve pra conferência na tela.
 */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  if (!transcricaoConfigurada()) {
    return NextResponse.json(
      {
        erro:
          "A leitura de preço por vídeo ainda não está configurada nesta loja (falta a chave de transcrição de áudio).",
      },
      { status: 503 }
    );
  }

  try {
    const dados = await request.formData();
    const audio = dados.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ erro: "Envie o áudio do vídeo." }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) {
      return NextResponse.json(
        { erro: "O áudio ficou grande demais. Grave um vídeo mais curto (até ~2 min)." },
        { status: 413 }
      );
    }

    const { transcricao, itens: detectados } = await lerPrecosDoVideo(audio);
    if (detectados.length === 0) {
      return NextResponse.json({ transcricao, itens: [] });
    }

    const itens = await Promise.all(
      detectados.map(async (item) => {
        const candidatos = await buscarProduto(empresaId, item.nome, 1);
        const melhor = candidatos[0];
        const produto =
          melhor && (melhor.score ?? 0) >= LIMIAR_SUGESTAO
            ? {
                id: melhor.id,
                nome: melhor.nome,
                precoAtual: Number(melhor.preco),
                tipoVenda: melhor.tipo_venda,
                score: melhor.score,
              }
            : null;
        return {
          nomeDetectado: item.nome,
          precoDetectado: item.preco,
          generico: item.generico,
          segundos: item.segundos,
          produto,
        };
      })
    );

    return NextResponse.json({ transcricao, itens });
  } catch (erro) {
    console.error("Falha ao ler preço por vídeo:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json(
      { erro: "Não foi possível ler o vídeo.", detalhe },
      { status: 500 }
    );
  }
}
