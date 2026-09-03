import { NextResponse } from "next/server";
import { buscarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { extrairProdutosDaVenda } from "@/lib/lerVendaFoto";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

export const dynamic = "force-dynamic";

const LIMIAR = 0.5;
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FOTOS = 6;

type ProdCand = { id: number; nome: string; preco: string; tipo_venda: string };

/**
 * POST /api/venda/foto (multipart, campo "fotos", pode repetir)
 * Lê a(s) foto(s) dos produtos no balcão, casa com o catálogo e devolve pra
 * conferência. Não grava nada — quem monta o carrinho é a tela.
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const dados = await request.formData();
    const fotos = dados.getAll("fotos").filter((f): f is File => f instanceof File);
    if (fotos.length === 0) {
      return NextResponse.json({ erro: "Envie ao menos uma foto." }, { status: 400 });
    }
    if (fotos.length > MAX_FOTOS) {
      return NextResponse.json({ erro: `Envie no máximo ${MAX_FOTOS} fotos por vez.` }, { status: 400 });
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

    const detectados = await extrairProdutosDaVenda(imagens);

    const itens = await Promise.all(
      detectados.map(async (d) => {
        const cands = (await buscarProduto(empresaId, d.descricao, 4)) as unknown as (ProdCand & {
          score?: number;
        })[];
        const bom = cands[0] && (cands[0].score ?? 0) >= LIMIAR ? cands[0] : null;
        const resto = (bom ? cands.slice(1) : cands).slice(0, 4);
        const mapear = (p: ProdCand) => ({
          id: p.id,
          nome: p.nome,
          preco: Number(p.preco),
          tipo_venda: p.tipo_venda,
        });
        return {
          descricaoDetectada: d.descricao,
          quantidade: Math.max(1, Math.round(Number(d.quantidade) || 1)),
          principal: bom ? mapear(bom) : null,
          alternativas: resto.map(mapear),
        };
      })
    );

    return NextResponse.json({ itens });
  } catch (e) {
    console.error("Falha ao ler a venda por foto:", e);
    return NextResponse.json(
      { erro: "Não foi possível ler a foto. Tente uma foto mais nítida, com as embalagens à mostra." },
      { status: 500 }
    );
  }
}
