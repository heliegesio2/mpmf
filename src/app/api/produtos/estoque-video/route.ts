import { NextResponse } from "next/server";
import { buscarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { lerEstoqueDoVideo, lerEstoqueDosQuadros, transcricaoConfigurada } from "@/lib/lerEstoqueVideo";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIMIAR_SUGESTAO = 0.5;
const MAX_BYTES = 4.4 * 1024 * 1024;
const MAX_QUADROS_VISAO = 8;

/** "data:image/jpeg;base64,AAAA..." -> { base64, mediaType }. */
function quadroParaImagem(dataUrl: string): ImagemEntrada | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1] as ImagemEntrada["mediaType"], base64: m[2] };
}

/** Escolhe até `max` quadros espalhados uniformemente pelo vídeo. */
function amostrarQuadros(quadros: string[], max: number): string[] {
  if (quadros.length <= max) return quadros;
  const passo = quadros.length / max;
  return Array.from({ length: max }, (_, i) => quadros[Math.floor(i * passo)]);
}

/**
 * POST /api/produtos/estoque-video  (multipart, campo "audio" = WAV extraído do vídeo,
 * campo "quadros" = quadros do vídeo em data URL, pode repetir)
 *
 * Transcreve a fala e tira dela a lista de { nome, quantidade, preço}. Se não
 * houver fala (ou ela não der pra entender), cai pra análise visual dos
 * quadros do vídeo — não precisa de narração pra funcionar. Casa cada nome
 * com o catálogo. Não grava nada — devolve pra conferência na tela.
 */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  if (!transcricaoConfigurada()) {
    return NextResponse.json(
      {
        erro:
          "O estoque por vídeo ainda não está configurado nesta loja (falta a chave de transcrição de áudio).",
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

    const { transcricao, itens: detectadosNaFala } = await lerEstoqueDoVideo(audio);

    let detectados = detectadosNaFala;
    let origem: "fala" | "video" = "fala";
    if (detectados.length === 0) {
      const quadrosRecebidos = dados.getAll("quadros").filter((q): q is string => typeof q === "string");
      const imagens = amostrarQuadros(quadrosRecebidos, MAX_QUADROS_VISAO)
        .map(quadroParaImagem)
        .filter((i): i is ImagemEntrada => i !== null);
      if (imagens.length > 0) {
        detectados = await lerEstoqueDosQuadros(imagens);
        origem = "video";
      }
    }

    if (detectados.length === 0) {
      return NextResponse.json({ transcricao, itens: [], origem });
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
                estoqueAtual: Number(melhor.estoque),
                precoAtual: Number(melhor.preco),
                tipoVenda: melhor.tipo_venda,
                score: melhor.score,
              }
            : null;
        return {
          nomeDetectado: item.nome,
          quantidadeDetectada: item.quantidade,
          precoDetectado: item.preco,
          generico: item.generico,
          segundos: item.segundos,
          produto,
        };
      })
    );

    return NextResponse.json({ transcricao, itens, origem });
  } catch (erro) {
    console.error("Falha ao ler estoque por vídeo:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: "Não foi possível ler o vídeo.", detalhe }, { status: 500 });
  }
}
