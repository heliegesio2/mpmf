/**
 * Lê quadros de um vídeo gravado dentro de um supermercado e devolve os
 * produtos visíveis com o preço lido da ETIQUETA de prateleira (visual, não há
 * narração). Espelha `lerEstoqueFoto.ts` — várias imagens numa chamada só.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

const client = new Anthropic();
const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type ItemMercadoVideo = {
  nome: string;
  preco: number | null;
  quadro: number;
};

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
            description: "Marca + tipo + peso/volume como está na embalagem.",
          },
          preco: {
            type: ["number", "null"],
            description:
              "Valor em reais lido na etiqueta/plaqueta de preço da prateleira ao lado/embaixo do produto. null se não der pra ler com confiança.",
          },
          quadro: {
            type: "integer",
            description: "Índice (começando em 0) da imagem em que este produto aparece melhor.",
          },
        },
        required: ["nome", "preco", "quadro"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Estas imagens são quadros de um vídeo gravado DENTRO de um supermercado brasileiro,
percorrendo as prateleiras. As imagens estão na ordem em que aparecem no vídeo (índice 0, 1, 2, ...).

Para cada PRODUTO diferente e claramente visível que tenha uma ETIQUETA/PLAQUETA DE PREÇO legível
na prateleira (ao lado, embaixo ou na frente do produto):
- "nome": marca + tipo + peso/volume como está escrito na embalagem
  (ex.: "Café Pilão Torrado e Moído 500g", "Refrigerante Coca-Cola 2L").
- "preco": só o número, em reais, que está na etiqueta de preço da prateleira. Se houver "preço de/por"
  (promoção), use o preço "por". Se a etiqueta não estiver legível, use null.
- "quadro": o índice da imagem em que o produto aparece com a embalagem e o preço mais nítidos.

Regras:
- Se o mesmo produto aparecer em vários quadros, liste UMA vez só, no melhor quadro.
- NÃO invente preço. Sem etiqueta legível, "preco": null (mas ainda liste o produto).
- Ignore produtos cortados na borda ou fora de foco sem nenhuma leitura possível.`;

export async function extrairProdutosDoMercado(
  imagens: ImagemEntrada[]
): Promise<ItemMercadoVideo[]> {
  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 6000,
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
  const json = JSON.parse(bloco.text) as { itens: ItemMercadoVideo[] };
  return (json.itens ?? []).map((i) => ({
    nome: String(i.nome ?? "").trim(),
    preco:
      typeof i.preco === "number" && Number.isFinite(i.preco) && i.preco > 0
        ? Math.round(i.preco * 100) / 100
        : null,
    quadro: Number.isInteger(i.quadro) ? Math.max(0, i.quadro) : 0,
  }));
}
