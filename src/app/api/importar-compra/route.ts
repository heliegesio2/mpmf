import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { buscarProduto, margemPadraoEmpresa, notaCompraExistente } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { extrairCupom, type CupomLido } from "@/lib/importarCompra";
import { amostrarUniforme, quadroParaImagem } from "@/lib/quadroImagem";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIMIAR_SUGESTAO = 0.5;

const TIPOS_MIDIA = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Poucas imagens pra caber no tempo limite da função serverless — mais
 * quadros deixa a chamada de visão lenta demais e a Vercel mata a função. */
const MAX_QUADROS_CUPOM = 5;

type ItemLido = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
};

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

/** Casa cada item com um produto ja cadastrado (pelo nome) e sugere o preco de venda. */
async function proporItens(empresaId: number, itens: ItemLido[], margem: number) {
  return Promise.all(
    itens.map(async (item) => {
      const candidatos = await buscarProduto(empresaId, item.descricao, 1);
      const melhor = candidatos[0];
      const sugestao =
        melhor && (melhor.score ?? 0) >= LIMIAR_SUGESTAO
          ? { id: melhor.id, nome: melhor.nome, score: melhor.score, estoqueAtual: Number(melhor.estoque) }
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
}

/**
 * A partir do cupom já lido (por foto ou por vídeo): confere se a chave de
 * acesso já foi processada, sugere o preço de venda e casa cada item com o
 * catálogo. Trecho comum às duas origens de imagem.
 */
async function finalizarCupomLido(empresaId: number, hashImagem: string, cupom: CupomLido) {
  const { nota, itens: itensExtraidos } = cupom;
  const chave = normalizarChave(nota.chaveAcesso);

  // mesma chave de acesso já processada? (nota refotografada/filmada de novo)
  if (chave) {
    const porChave = await notaCompraExistente(empresaId, hashImagem, chave);
    if (porChave) return respostaJaProcessada(porChave);
  }

  const margem = await margemPadraoEmpresa(empresaId);
  const itens = await proporItens(empresaId, itensExtraidos, margem);

  return NextResponse.json({
    itens,
    margem,
    nota: { hashImagem, chave, numero: nota.numero, emitente: nota.emitente },
  });
}

/** Foto do cupom (campo "foto") — a leitura custa uma chamada de visao. */
async function importarDeFoto(foto: File, empresaId: number) {
  try {
    if (!TIPOS_MIDIA.has(foto.type)) {
      return NextResponse.json({ erro: "Formato de imagem não suportado." }, { status: 400 });
    }

    const bytes = Buffer.from(await foto.arrayBuffer());
    const hashImagem = createHash("sha256").update(bytes).digest("hex");

    // mesma imagem já processada? corta antes de gastar visão.
    const porImagem = await notaCompraExistente(empresaId, hashImagem, null);
    if (porImagem) return respostaJaProcessada(porImagem);

    const base64 = bytes.toString("base64");
    const cupom = await extrairCupom([
      { base64, mediaType: foto.type as ImagemEntrada["mediaType"] },
    ]);

    return await finalizarCupomLido(empresaId, hashImagem, cupom);
  } catch (erro) {
    console.error("Falha ao importar cupom:", erro);
    return NextResponse.json(
      { erro: "Não foi possível ler o cupom. Tente uma foto mais nítida." },
      { status: 500 }
    );
  }
}

/**
 * Vídeo do cupom (campo "quadros", data URL, pode repetir) — pra notas
 * pequenas/com letra miúda, o lojista filma de perto em vez de uma foto só.
 * Os quadros já vêm capturados pelo `<GravadorVideo>` no cliente; aqui só
 * amostramos até `MAX_QUADROS_CUPOM` e mandamos todos numa chamada de visão
 * só, pedindo pra não duplicar item que aparece em mais de um quadro.
 */
async function importarDeVideo(quadrosRecebidos: string[], empresaId: number) {
  try {
    const imagens = amostrarUniforme(quadrosRecebidos, MAX_QUADROS_CUPOM)
      .map(quadroParaImagem)
      .filter((i): i is ImagemEntrada => i !== null);
    if (imagens.length === 0) {
      return NextResponse.json({ erro: "Não recebi nenhum quadro válido do vídeo." }, { status: 400 });
    }

    // mesmo conjunto de quadros já processado? corta antes de gastar visão.
    const hashImagem = createHash("sha256").update(quadrosRecebidos.join("|")).digest("hex");
    const porImagem = await notaCompraExistente(empresaId, hashImagem, null);
    if (porImagem) return respostaJaProcessada(porImagem);

    const cupom = await extrairCupom(imagens);
    return await finalizarCupomLido(empresaId, hashImagem, cupom);
  } catch (erro) {
    console.error("Falha ao importar cupom por vídeo:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: "Não foi possível ler o vídeo do cupom.", detalhe }, { status: 500 });
  }
}

/**
 * POST /api/importar-compra (multipart) — duas origens, mesma resposta:
 *   - campo "foto": le a foto do cupom (visao)
 *   - campo "quadros" (repetido): le os quadros de um video do cupom (visao)
 * Extrai os itens e sugere o produto correspondente ja cadastrado (por nome).
 * Nao grava nada — so devolve a lista pra conferencia. Se a mesma nota ja foi
 * processada, devolve { jaProcessada: true } sem reprocessar.
 */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  let dados: FormData;
  try {
    dados = await request.formData();
  } catch (erro) {
    console.error("Falha ao ler o corpo da requisição de importar compra:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: "Não foi possível ler o envio.", detalhe }, { status: 400 });
  }

  const foto = dados.get("foto");
  if (foto instanceof File) return importarDeFoto(foto, empresaId);

  const quadros = dados.getAll("quadros").filter((q): q is string => typeof q === "string");
  if (quadros.length > 0) return importarDeVideo(quadros, empresaId);

  return NextResponse.json({ erro: "Envie a foto ou o vídeo do cupom." }, { status: 400 });
}
