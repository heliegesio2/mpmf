import { NextResponse } from "next/server";
import { buscarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { extrairProdutosDoMercado } from "@/lib/lerMercadoVideo";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

export const dynamic = "force-dynamic";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 6;
const LIMIAR = 0.5;

/**
 * POST /api/produtos/comercios-grandes (multipart, campo "fotos", pode repetir)
 * Lê um lote de quadros do vídeo do supermercado e devolve os produtos +
 * preço da etiqueta. É chamado várias vezes (um lote por vez) enquanto a tela
 * mostra o progresso.
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const dados = await request.formData();
    const fotos = dados.getAll("fotos").filter((f): f is File => f instanceof File);
    if (fotos.length === 0 || fotos.length > MAX) {
      return NextResponse.json({ erro: `Envie de 1 a ${MAX} quadros por lote.` }, { status: 400 });
    }
    for (const f of fotos) {
      if (!TIPOS.has(f.type)) {
        return NextResponse.json({ erro: "Formato de imagem não suportado." }, { status: 400 });
      }
    }

    const imagens: ImagemEntrada[] = await Promise.all(
      fotos.map(async (f) => ({
        base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
        mediaType: f.type as ImagemEntrada["mediaType"],
      }))
    );

    const detectados = await extrairProdutosDoMercado(imagens);

    const itens = await Promise.all(
      detectados
        .filter((d) => d.nome.length >= 2)
        .map(async (d) => {
          const cand = (await buscarProduto(empresaId, d.nome, 1)) as unknown as {
            id: number;
            nome: string;
            score?: number;
          }[];
          const ja =
            cand[0] && (cand[0].score ?? 0) >= LIMIAR
              ? { id: cand[0].id, nome: cand[0].nome }
              : null;
          return { nome: d.nome, preco: d.preco, quadro: d.quadro, jaCadastrado: ja };
        })
    );

    return NextResponse.json({ itens });
  } catch (e) {
    console.error("Falha ao ler o vídeo do supermercado:", e);
    return NextResponse.json(
      { erro: "Não foi possível ler esse trecho. Verifique o ANTHROPIC_API_KEY / tente um vídeo mais nítido." },
      { status: 500 }
    );
  }
}
