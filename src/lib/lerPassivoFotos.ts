/**
 * Identifica os PASSIVOS (bens fixos: banca, cofre, congelador, balcão…) que
 * aparecem em fotos ou em quadros de um vídeo do estabelecimento. Uma única
 * chamada de visão com todas as imagens; o modelo devolve cada bem com a
 * categoria, a quantidade e em qual imagem ele aparece melhor.
 */

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIAS_PASSIVO } from "./passivo";
import type { ImagemEntrada } from "./lerEstoqueFoto";

const client = new Anthropic();
const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type PassivoDetectado = {
  nome: string;
  categoria: string;
  quantidade: number;
  descricao: string;
  /** 1 = primeira imagem enviada */
  imagemIndice: number;
};

const SCHEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome curto do bem em português (ex.: Congelador horizontal 2 tampas)." },
          categoria: { type: "string", enum: CATEGORIAS_PASSIVO.map((c) => c.valor) },
          quantidade: { type: "integer", description: "Quantos desse mesmo bem existem (mínimo 1)." },
          descricao: {
            type: "string",
            description: "Marca, modelo, cor, tamanho e estado que dê pra ver. Curto. Vazio se nada visível.",
          },
          imagemIndice: {
            type: "integer",
            description: "Número (a partir de 1) da imagem em que este bem aparece melhor.",
          },
        },
        required: ["nome", "categoria", "quantidade", "descricao", "imagemIndice"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Estas imagens mostram o interior/exterior de um pequeno comércio brasileiro (mercadinho, banca,
conveniência). Pode ser uma sequência de quadros de um vídeo percorrendo o local — nesse caso o mesmo bem
aparece em várias imagens: conte-o UMA vez só.

Faça o levantamento dos PASSIVOS: os bens fixos que a empresa possui e NÃO vende — móveis, equipamentos,
máquinas, eletrônicos, veículos. NÃO liste mercadoria à venda (produtos nas prateleiras, bebidas, pacotes),
nem pessoas, nem itens da construção (paredes, piso, portas).

Categorias (use exatamente o código):
${CATEGORIAS_PASSIVO.map((c) => `- ${c.valor}: ${c.dica}`).join("\n")}

Para cada bem distinto: "nome" curto em português, "categoria", "quantidade" (some os iguais que aparecem),
"descricao" (marca/modelo/cor/tamanho/estado visíveis) e "imagemIndice" (a imagem em que ele aparece melhor,
contando a partir de 1). Não invente bens que não aparecem.`;

export async function identificarPassivos(imagens: ImagemEntrada[]): Promise<PassivoDetectado[]> {
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
  return (JSON.parse(bloco.text) as { itens: PassivoDetectado[] }).itens;
}
