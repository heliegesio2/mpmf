import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { buscarProduto, margemPadraoEmpresa, notaCompraExistente } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { extrairCupom } from "@/lib/importarCompra";

export const dynamic = "force-dynamic";

const LIMIAR_SUGESTAO = 0.5;

const TIPOS_MIDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

function precoVendaComMargem(precoCompra: number, margemPct: number): number {
  return Math.round(precoCompra * (1 + margemPct / 100) * 100) / 100;
}

/** So os digitos; chave de acesso valida tem 44. */
function normalizarChave(bruta: string | null): string | null {
  const so = String(bruta ?? "").replace(/\D/g, "");
  return so.length === 44 ? so : null;
}

function respostaJaProcessada(nota: { criado_em: string; numero: string | null; emitente: string | null }) {
  const quando = new Date(nota.criado_em).toLocaleDateString("pt-BR");
  const alvo = [nota.emitente, nota.numero && `nº ${nota.numero}`].filter(Boolean).join(" · ");
  return NextResponse.json({
    jaProcessada: true,
    quando,
    numero: nota.numero,
    emitente: nota.emitente,
    aviso: `Essa nota já foi processada em ${quando}${alvo ? ` (${alvo})` : ""}.`,
  });
}

/**
 * POST /api/importar-compra (multipart, campo "foto")
 * Le a foto do cupom, extrai os itens e sugere o produto correspondente ja
 * cadastrado (por nome). Nao grava nada — so devolve a lista pra conferencia.
 * Se a mesma nota (mesma imagem ou mesma chave de acesso) ja foi processada,
 * devolve { jaProcessada: true } sem reprocessar.
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
    const hashImagem = createHash("sha256").update(bytes).digest("hex");

    // 1) mesma imagem já processada? corta antes de gastar visão.
    const porImagem = await notaCompraExistente(empresaId, hashImagem, null);
    if (porImagem) return respostaJaProcessada(porImagem);

    const base64 = bytes.toString("base64");
    const { nota, itens: itensExtraidos } = await extrairCupom(
      base64,
      foto.type as "image/jpeg" | "image/png" | "image/webp"
    );

    const chave = normalizarChave(nota.chaveAcesso);

    // 2) mesma chave de acesso já processada? (nota refotografada)
    if (chave) {
      const porChave = await notaCompraExistente(empresaId, hashImagem, chave);
      if (porChave) return respostaJaProcessada(porChave);
    }

    const margem = await margemPadraoEmpresa(empresaId);

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
          precoVendaSugerido: precoVendaComMargem(item.valorUnitario, margem),
          produtoSugerido: sugestao,
        };
      })
    );

    return NextResponse.json({
      itens,
      margem,
      nota: {
        hashImagem,
        chave,
        numero: nota.numero,
        emitente: nota.emitente,
      },
    });
  } catch (erro) {
    console.error("Falha ao importar cupom:", erro);
    return NextResponse.json(
      { erro: "Não foi possível ler o cupom. Tente uma foto mais nítida." },
      { status: 500 }
    );
  }
}
