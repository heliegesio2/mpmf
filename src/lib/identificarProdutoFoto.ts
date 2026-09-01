/**
 * Olha a foto de um único produto (tirada no cadastro ou na venda) e devolve
 * o nome pra preencher o campo — marca + tipo + tamanho, como estaria escrito
 * na etiqueta da prateleira. Não inventa: se não der pra ler, devolve "".
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type ImagemProduto = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

const SCHEMA = {
  type: "object",
  properties: {
    nome: {
      type: "string",
      description:
        "Nome do produto pra etiqueta: marca + tipo + peso/volume quando visível " +
        '(ex.: "Areia Fina Saco 20kg", "Coca-Cola Lata 350ml"). "" se não der pra identificar.',
    },
  },
  required: ["nome"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Esta é a foto de UM produto de mercadinho brasileiro, tirada pelo lojista pra cadastrar no sistema.

Devolva em "nome" como esse produto ficaria escrito numa etiqueta de prateleira: marca, tipo/sabor e
peso ou volume quando estiverem visíveis na embalagem. Use maiúsculas e minúsculas normais.

Se a imagem estiver ilegível, sem embalagem reconhecível ou com vários produtos diferentes, devolva "".
Não chute marca nem tamanho que você não consegue ver.`;

export async function identificarNomeDaFoto(imagem: ImagemProduto): Promise<string> {
  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: imagem.mediaType, data: imagem.base64 },
          },
          { type: "text", text: INSTRUCAO },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") return "";

  try {
    const json = JSON.parse(bloco.text) as { nome?: string };
    return (json.nome ?? "").trim();
  } catch {
    return "";
  }
}
