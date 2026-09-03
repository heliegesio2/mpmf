import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/sessao";
import { extrairProdutosDoMercado } from "@/lib/lerMercadoVideo";
import { extrairPrecosDoEncarte, type EntradaEncarte, type TipoEncarte } from "@/lib/lerEncartePdf";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

export const dynamic = "force-dynamic";

const TIPOS_IMG = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMG = 8;

/**
 * POST /api/produtos/comercios-grandes (multipart)
 *
 * Lê preços de um concorrente. Não grava nada — só extrai a lista de
 * { nome, preco }. A comparação e o registro ficam no /analisar.
 *
 * - campo "fotos" (repetível) + "fonte"="video"  -> quadros do vídeo (etiqueta de prateleira)
 * - campo "fotos" (repetível) + "fonte"="foto"   -> fotos do encarte/prateleira
 * - campo "pdf"                                   -> encarte em PDF
 */
export async function POST(request: Request) {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const dados = await request.formData();
    const fonte = String(dados.get("fonte") ?? "video");
    const pdf = dados.get("pdf");
    const fotos = dados.getAll("fotos").filter((f): f is File => f instanceof File);

    if (pdf instanceof File) {
      if (pdf.type !== "application/pdf") {
        return NextResponse.json({ erro: "Envie um arquivo PDF." }, { status: 400 });
      }
      const base64 = Buffer.from(await pdf.arrayBuffer()).toString("base64");
      const itens = await extrairPrecosDoEncarte([{ base64, tipo: "application/pdf" }]);
      return NextResponse.json({ itens });
    }

    if (fotos.length === 0 || fotos.length > MAX_IMG) {
      return NextResponse.json({ erro: `Envie de 1 a ${MAX_IMG} imagens.` }, { status: 400 });
    }
    for (const f of fotos) {
      if (!TIPOS_IMG.has(f.type)) {
        return NextResponse.json({ erro: "Formato de imagem não suportado." }, { status: 400 });
      }
    }

    if (fonte === "video") {
      const imagens: ImagemEntrada[] = await Promise.all(
        fotos.map(async (f) => ({
          base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
          mediaType: f.type as ImagemEntrada["mediaType"],
        }))
      );
      const detectados = await extrairProdutosDoMercado(imagens);
      return NextResponse.json({
        itens: detectados.filter((d) => d.nome.length >= 2).map((d) => ({ nome: d.nome, preco: d.preco })),
      });
    }

    const entradas: EntradaEncarte[] = await Promise.all(
      fotos.map(async (f) => ({
        base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
        tipo: f.type as TipoEncarte,
      }))
    );
    const itens = await extrairPrecosDoEncarte(entradas);
    return NextResponse.json({ itens: itens.filter((d) => d.nome.length >= 2) });
  } catch (e) {
    console.error("Falha ao ler os preços do concorrente:", e);
    return NextResponse.json(
      {
        erro: "Não foi possível ler. Verifique o ANTHROPIC_API_KEY ou tente um arquivo mais nítido.",
      },
      { status: 500 }
    );
  }
}
