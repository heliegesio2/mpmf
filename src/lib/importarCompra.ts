/**
 * Le a foto de um cupom fiscal de compra (nota do fornecedor/distribuidora) e
 * extrai os itens comprados via Claude (visao). O modelo devolve JSON no
 * formato exato do schema abaixo — sem isso, respostas em prosa quebrariam
 * o parse.
 *
 * Alem dos itens, le os dados da nota (chave de acesso, numero, emitente) — sao
 * usados pra reconhecer quando a mesma nota e reenviada.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

const client = new Anthropic();

const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type ItemCupom = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
};

export type DadosNota = {
  chaveAcesso: string | null;
  numero: string | null;
  emitente: string | null;
};

export type CupomLido = {
  nota: DadosNota;
  itens: ItemCupom[];
};

const SCHEMA_CUPOM = {
  type: "object",
  properties: {
    nota: {
      type: "object",
      properties: {
        chaveAcesso: {
          type: ["string", "null"],
          description:
            "Chave de acesso da NFe/NFC-e (44 digitos), so os numeros, sem espacos. null se nao aparecer.",
        },
        numero: {
          type: ["string", "null"],
          description: 'Numero da nota (campo "No"/"NUMERO"). null se nao aparecer.',
        },
        emitente: {
          type: ["string", "null"],
          description: "Razao social / nome de quem emitiu a nota (o fornecedor). null se nao aparecer.",
        },
      },
      required: ["chaveAcesso", "numero", "emitente"],
      additionalProperties: false,
    },
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
  required: ["nota", "itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Estas imagens mostram um cupom fiscal (nota de compra) de um mercadinho brasileiro,
comprando mercadoria de um fornecedor/distribuidora — pode ser uma foto so, ou varios quadros de um
video do MESMO cupom (o lojista filmou de perto pra conseguir ler letra miuda numa nota pequena).
Quando houver mais de uma imagem, trate como angulos/zooms diferentes da MESMA nota: NAO repita um
item que ja apareceu numa imagem anterior, e junte os dados da nota a partir de onde estiverem mais
legiveis. Extraia cada item comprado (uma vez so) e os dados da nota.

Itens:
- "descricao": expanda abreviacoes para um nome de produto legivel (ex.: "FEIJ.PRET.TURAMA" -> "Feijao Preto Turama").
- "quantidade" e "unidade": use a coluna de quantidade/UN do cupom (ex.: "2,125 kg" -> quantidade 2.125, unidade "kg").
- "valorUnitario": a coluna de valor unitario (VL UN).
- "valorTotal": o valor total da linha (VL ITEM).
- Ignore cabecalho, rodape, totais gerais, QR code e dados fiscais — so os itens comprados.
- Se um numero estiver borrado/cortado pela dobra do papel, faca a melhor leitura possivel
  usando o valor total e a quantidade para conferir a conta (valorUnitario * quantidade ~= valorTotal).

Dados da nota ("nota"):
- "chaveAcesso": a chave de acesso da NFe/NFC-e — 44 digitos, geralmente impressa embaixo do
  codigo de barras ou perto do QR code. Devolva SO os numeros, sem espacos. null se nao der pra ler.
- "numero": o numero da nota (campo "No" / "NUMERO" / "NF-e no").
- "emitente": nome ou razao social de quem emitiu a nota (o fornecedor/distribuidora), no topo do cupom.`;

export async function extrairCupom(imagens: ImagemEntrada[]): Promise<CupomLido> {
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
    output_config: { format: { type: "json_schema", schema: SCHEMA_CUPOM } },
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new Error("O modelo não devolveu texto.");
  }

  const json = JSON.parse(bloco.text) as CupomLido;
  return { nota: json.nota ?? { chaveAcesso: null, numero: null, emitente: null }, itens: json.itens ?? [] };
}
