import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/sessao";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";
import { identificarPassivos } from "@/lib/lerPassivoFotos";
import { categoriaValida } from "@/lib/passivo";

export const dynamic = "force-dynamic";

const MAX_IMAGENS = 12;
const LIMITE_IMAGEM = 2_500_000; // caracteres do data URL
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s;

/**
 * POST /api/passivos/analisar { imagens: string[] (data URLs) }
 * Fotos ou quadros de vídeo do estabelecimento → o que a IA reconheceu como
 * passivo (banca, cofre, congelador…). Não grava nada; devolve pra conferência.
 */
export async function POST(request: Request) {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const corpo = (await request.json()) as { imagens?: unknown };
    const lista = Array.isArray(corpo.imagens) ? corpo.imagens : [];
    if (lista.length === 0) return NextResponse.json({ erro: "Envie ao menos uma imagem." }, { status: 400 });
    if (lista.length > MAX_IMAGENS) {
      return NextResponse.json({ erro: `Envie no máximo ${MAX_IMAGENS} imagens por vez.` }, { status: 400 });
    }

    const imagens: ImagemEntrada[] = [];
    for (const d of lista) {
      const m = typeof d === "string" && d.length <= LIMITE_IMAGEM ? DATA_URL.exec(d) : null;
      if (!m) return NextResponse.json({ erro: "Imagem inválida ou grande demais." }, { status: 400 });
      imagens.push({ base64: m[2], mediaType: m[1] as ImagemEntrada["mediaType"] });
    }

    const detectados = await identificarPassivos(imagens);
    const itens = detectados.map((d) => ({
      nome: String(d.nome ?? "").trim() || "Bem",
      categoria: categoriaValida(d.categoria) ? d.categoria : "outros",
      quantidade: Math.max(1, Math.round(Number(d.quantidade) || 1)),
      descricao: String(d.descricao ?? "").trim(),
      imagemIndice: Math.min(imagens.length, Math.max(1, Math.round(Number(d.imagemIndice) || 1))),
    }));
    return NextResponse.json({ itens });
  } catch (e) {
    console.error("Falha ao identificar passivos:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível analisar as imagens.", detalhe }, { status: 500 });
  }
}
