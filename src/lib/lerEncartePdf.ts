/**
 * Lê um encarte de ofertas de supermercado (PDF ou foto) e devolve os produtos
 * anunciados com o preço. Visão pura — o preço sai do próprio encarte.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type ItemEncarte = { nome: string; preco: number | null };

export type TipoEncarte = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

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
        },
        required: ["nome", "preco"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Este documento é um encarte de ofertas de um supermercado brasileiro.
Liste TODOS os produtos anunciados com preço.

- "nome": marca + tipo + peso/volume como aparece no encarte
  (ex.: "Tomate Salada kg", "Café Pilão Torrado e Moído 500g", "Sabão em Pó OMO 1,6kg").
- "preco": só o número, em reais. Se houver "de X por Y", use Y. Se for hortifrúti vendido
  por quilo, use o preço do quilo. null só se o item não tiver um preço legível.
- Um produto por linha. Não repita o mesmo produto.
- Ignore textos de regulamento, validade, endereço da loja e chamadas sem preço.`;

export type EntradaEncarte = { base64: string; tipo: TipoEncarte };

export async function extrairPrecosDoEncarte(entradas: EntradaEncarte[]): Promise<ItemEncarte[]> {
  const blocos = entradas.map((e) =>
    e.tipo === "application/pdf"
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: e.base64 },
        }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: e.tipo, data: e.base64 },
        }
  );

  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 8000,
    messages: [{ role: "user", content: [...blocos, { type: "text", text: INSTRUCAO }] }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const texto = resposta.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") throw new Error("O modelo não devolveu texto.");
  const json = JSON.parse(texto.text) as { itens: ItemEncarte[] };
  return (json.itens ?? []).map((i) => ({
    nome: String(i.nome ?? "").trim(),
    preco:
      typeof i.preco === "number" && Number.isFinite(i.preco) && i.preco > 0
        ? Math.round(i.preco * 100) / 100
        : null,
  }));
}
