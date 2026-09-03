/**
 * Lê a foto anexada a uma anotação e devolve o texto útil pro lojista: o que
 * está escrito, uma lista transcrita, ou o nome de um produto. Falha aqui não é
 * fatal — quem chama trata "" como "não deu pra ler".
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type ImagemAnotacao = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

const SCHEMA = {
  type: "object",
  properties: {
    texto: {
      type: "string",
      description:
        "Conteúdo útil da foto pro lojista. Vazio se não der pra ler nada.",
    },
  },
  required: ["texto"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Esta foto foi anexada a uma anotação de um lojista de mercadinho brasileiro.
Devolva em "texto" só o conteúdo útil pra ele, sem comentar nada:

- Se houver TEXTO escrito (bilhete, recado, recibo, cartaz, quadro): transcreva o que importa,
  sem enfeite e sem repetir cabeçalho/rodapé irrelevante.
- Se for uma LISTA (de compras, de tarefas, de pedidos, à mão ou impressa): devolva um item por
  linha, cada linha começando com "- ".
- Se for um PRODUTO (só a embalagem, sem lista): devolva "marca + tipo + peso/volume" como está
  escrito na embalagem (ex.: "Macarrão Vilma Espaguete 500g", "Fósforo Fiat Lux caixa",
  "Café Pilão 500g").

Se a imagem estiver ilegível ou não tiver nada aproveitável, devolva "".`;

export async function interpretarFotoAnotacao(imagem: ImagemAnotacao): Promise<string> {
  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 1500,
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
    const json = JSON.parse(bloco.text) as { texto?: string };
    return (json.texto ?? "").trim();
  } catch {
    return "";
  }
}
