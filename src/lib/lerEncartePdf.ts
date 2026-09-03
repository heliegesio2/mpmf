/**
 * Lê um encarte de ofertas de supermercado (páginas já rasterizadas em imagem, ou
 * fotos) e devolve os produtos anunciados com o preço e um retângulo pra recortar
 * a miniatura de cada um. Visão pura.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type Caixa = { x0: number; y0: number; x1: number; y1: number };

export type ItemEncarte = {
  nome: string;
  preco: number | null;
  /** índice (0-based) da imagem onde o produto aparece */
  imagem: number;
  /** retângulo do produto+preço, coordenadas 0..1 */
  caixa: Caixa | null;
};

export type TipoEncarte = "image/jpeg" | "image/png" | "image/webp";

const SCHEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: {
            type: "string",
            description: "Marca + tipo + peso/volume do produto anunciado, como está no encarte.",
          },
          preco: {
            type: ["number", "null"],
            description:
              "Preço da oferta em reais. Se houver 'de/por', use o 'por'. Hortifrúti por kg: o preço do kg. null se não houver preço claro pra este item.",
          },
          imagem: {
            type: "integer",
            description: "Índice (começando em 0) da imagem em que este produto aparece.",
          },
          caixa: {
            type: ["object", "null"],
            description:
              "Retângulo que enquadra a FOTO do produto junto com o preço, pra recortar uma miniatura. Coordenadas de 0 a 1: x0/y0 = canto superior esquerdo, x1/y1 = canto inferior direito. null se não der pra localizar.",
            properties: {
              x0: { type: "number" },
              y0: { type: "number" },
              x1: { type: "number" },
              y1: { type: "number" },
            },
            required: ["x0", "y0", "x1", "y1"],
            additionalProperties: false,
          },
        },
        required: ["nome", "preco", "imagem", "caixa"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Estas imagens são páginas de um encarte de ofertas de um supermercado brasileiro
(ou fotos de prateleira/encarte). As imagens estão numeradas a partir de 0.

Liste TODOS os produtos anunciados com preço.
- "nome": marca + tipo + peso/volume como aparece
  (ex.: "Tomate Salada kg", "Café Pilão Torrado e Moído 500g", "Sabão em Pó OMO 1,6kg").
- "preco": só o número, em reais. Se houver "de X por Y", use Y. Hortifrúti por quilo: o preço do quilo.
  null só se o item não tiver preço legível.
- "imagem": o índice da imagem em que o produto está.
- "caixa": o retângulo (0 a 1) que enquadra a foto do produto com o preço, pra recortar a miniatura.
- Um produto por linha, sem repetir. Ignore regulamento, validade, endereço da loja e chamadas sem preço.`;

export type EntradaEncarte = { base64: string; tipo: TipoEncarte };

export async function extrairPrecosDoEncarte(entradas: EntradaEncarte[]): Promise<ItemEncarte[]> {
  const blocos = entradas.map((e) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: e.tipo, data: e.base64 },
  }));

  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 8000,
    messages: [{ role: "user", content: [...blocos, { type: "text", text: INSTRUCAO }] }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const texto = resposta.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") throw new Error("O modelo não devolveu texto.");
  const json = JSON.parse(texto.text) as { itens: ItemEncarte[] };
  const nEntradas = entradas.length;
  return (json.itens ?? []).map((i) => {
    const cx = i.caixa;
    const caixaOk =
      cx &&
      [cx.x0, cx.y0, cx.x1, cx.y1].every((n) => typeof n === "number" && Number.isFinite(n)) &&
      cx.x1 > cx.x0 &&
      cx.y1 > cx.y0
        ? {
            x0: Math.max(0, Math.min(1, cx.x0)),
            y0: Math.max(0, Math.min(1, cx.y0)),
            x1: Math.max(0, Math.min(1, cx.x1)),
            y1: Math.max(0, Math.min(1, cx.y1)),
          }
        : null;
    return {
      nome: String(i.nome ?? "").trim(),
      preco:
        typeof i.preco === "number" && Number.isFinite(i.preco) && i.preco > 0
          ? Math.round(i.preco * 100) / 100
          : null,
      imagem: Number.isInteger(i.imagem) ? Math.max(0, Math.min(nEntradas - 1, i.imagem)) : 0,
      caixa: caixaOk,
    };
  });
}
