/**
 * Le a foto de um cupom fiscal de compra (nota do fornecedor/distribuidora) e
 * extrai os itens comprados via Claude (visao). O modelo devolve JSON no
 * formato exato do schema abaixo — sem isso, respostas em prosa quebrariam
 * o parse.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type ItemCupom = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
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
            description: "Nome do produto, por extenso (expanda abreviacoes do cupom).",
          },
          quantidade: { type: "number" },
          unidade: {
            type: "string",
            description: "Unidade de medida como aparece no cupom: kg, un, dz, pt (pacote) etc.",
          },
          valorUnitario: { type: "number", description: "Preco pago por unidade/kg." },
          valorTotal: { type: "number", description: "Valor total da linha." },
        },
        required: ["descricao", "quantidade", "unidade", "valorUnitario", "valorTotal"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Esta imagem e um cupom fiscal (nota de compra) de um mercadinho brasileiro,
comprando mercadoria de um fornecedor/distribuidora. Extraia cada item comprado.

- "descricao": expanda abreviacoes para um nome de produto legivel (ex.: "FEIJ.PRET.TURAMA" -> "Feijao Preto Turama").
- "quantidade" e "unidade": use a coluna de quantidade/UN do cupom (ex.: "2,125 kg" -> quantidade 2.125, unidade "kg").
- "valorUnitario": a coluna de valor unitario (VL UN).
- "valorTotal": o valor total da linha (VL ITEM).
- Ignore cabecalho, rodape, totais gerais, QR code e dados fiscais — so os itens comprados.
- Se um numero estiver borrado/cortado pela dobra do papel, faca a melhor leitura possivel
  usando o valor total e a quantidade para conferir a conta (valorUnitario * quantidade ~= valorTotal).`;

export async function extrairItensDoCupom(
  imagemBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<ItemCupom[]> {
  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imagemBase64 } },
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

  const json = JSON.parse(bloco.text) as { itens: ItemCupom[] };
  return json.itens;
}
