/**
 * Lê uma foto dos produtos que o cliente pôs no balcão e devolve cada produto
 * visível + quantas embalagens aparecem, pra montar o carrinho da venda. Mesma
 * forma de `lerEstoqueFoto.ts`.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

const client = new Anthropic();
const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type ItemVendaFoto = {
  descricao: string;
  quantidade: number;
};

const SCHEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descricao: {
            type: "string",
            description: "Nome do produto: marca + tipo + peso/volume como está na embalagem.",
          },
          quantidade: {
            type: "number",
            description: "Quantas embalagens/unidades desse produto aparecem na foto.",
          },
        },
        required: ["descricao", "quantidade"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Esta foto mostra os produtos que um cliente pôs no balcão de um mercadinho brasileiro
pra comprar. Para cada produto DIFERENTE e visível:
- "descricao": marca + tipo + peso/volume como está escrito na embalagem
  (ex.: "Café Sokfé Torrado e Moído 500g", "Macarrão Vilma Espaguete 500g", "Batata Palha Yoki 105g").
- "quantidade": quantas embalagens/unidades desse mesmo produto aparecem na foto.

Não invente produto que não aparece. Se dois produtos são da mesma marca mas tipos diferentes
(espaguete x nhoque), são itens separados. Ignore o que estiver muito cortado na borda se não der
pra ler com confiança.`;

export async function extrairProdutosDaVenda(imagens: ImagemEntrada[]): Promise<ItemVendaFoto[]> {
  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          ...imagens.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
          })),
          { type: "text", text: INSTRUCAO },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") throw new Error("O modelo não devolveu texto.");
  const json = JSON.parse(bloco.text) as { itens: ItemVendaFoto[] };
  return json.itens ?? [];
}
