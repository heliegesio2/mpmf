/**
 * Le uma ou mais fotos de prateleira/gondola e estima quantas unidades de
 * cada produto estao visiveis, pra atualizar o estoque. Aceita varias fotos
 * numa unica chamada (o lojista costuma fotografar mais de uma prateleira) —
 * o modelo trata cada foto como uma area diferente da loja e soma as
 * contagens de um mesmo produto se ele aparecer em mais de uma foto.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type ItemEstoqueFoto = {
  descricao: string;
  quantidadeEstimada: number;
  unidade: string;
};

export type ImagemEntrada = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

const SCHEMA_ITENS = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descricao: {
            type: "string",
            description: "Nome do produto como esta escrito na embalagem, por extenso.",
          },
          quantidadeEstimada: {
            type: "number",
            description: "Quantas unidades/pacotes desse produto estao visiveis nas fotos.",
          },
          unidade: {
            type: "string",
            description: "O que esta sendo contado: pacote, unidade, garrafa, caixa etc.",
          },
        },
        required: ["descricao", "quantidadeEstimada", "unidade"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Estas fotos mostram prateleiras/gondolas de um mercadinho brasileiro. Cada foto e uma
area diferente da loja (nao repita a mesma prateleira fotografada duas vezes, a menos que esteja
claramente contando produtos diferentes nela).

Para cada produto diferente e visivel:
- "descricao": nome do produto como esta escrito na embalagem (marca + tipo, ex.: "Vilma Farinha de Trigo").
- "quantidadeEstimada": conte quantas embalagens/unidades desse produto estao visiveis, somando entre
  todas as fotos se o mesmo produto aparecer em mais de uma. Para pilhas/empilhamentos, estime pela
  altura e area visivel — nao precisa ser exato, e uma contagem de estoque aproximada.
- "unidade": o que voce esta contando (pacote, unidade, garrafa, caixa, fardo etc — o que fizer sentido
  pro produto).

Ignore produtos cortados na borda da foto se nao der pra contar com confianca. Nao invente produto que
nao aparece nas fotos.`;

export async function extrairEstoqueDasFotos(imagens: ImagemEntrada[]): Promise<ItemEstoqueFoto[]> {
  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 8000,
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
    output_config: { format: { type: "json_schema", schema: SCHEMA_ITENS } },
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new Error("O modelo não devolveu texto.");
  }

  const json = JSON.parse(bloco.text) as { itens: ItemEstoqueFoto[] };
  return json.itens;
}
