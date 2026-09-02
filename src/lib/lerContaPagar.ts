/**
 * Lê a foto de um boleto / nota / conta a pagar e extrai o essencial via
 * Claude (visão), em JSON garantido pelo schema. Nada é gravado aqui — o
 * lojista confere tudo na tela antes de salvar.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const MODELO = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export type DadosContaPagar = {
  fornecedorNome: string;
  fornecedorDocumento: string;
  valor: number;
  vencimento: string;
  documento: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    fornecedorNome: {
      type: "string",
      description:
        "Nome do beneficiário / emitente / cedente da conta (quem vai receber). " +
        '"" se não der pra ler.',
    },
    fornecedorDocumento: {
      type: "string",
      description: 'CNPJ ou CPF do beneficiário, só os dígitos. "" se não aparecer.',
    },
    valor: {
      type: "number",
      description: "Valor a pagar do documento, em reais. 0 se não der pra ler.",
    },
    vencimento: {
      type: "string",
      description: 'Data de vencimento no formato AAAA-MM-DD. "" se não aparecer.',
    },
    documento: {
      type: "string",
      description:
        'Número da nota fiscal / boleto / fatura, se aparecer (ex.: "NF 4471"). "" se não houver.',
    },
  },
  required: ["fornecedorNome", "fornecedorDocumento", "valor", "vencimento", "documento"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Esta é a foto de uma conta a pagar de um mercadinho brasileiro: um boleto
bancário, uma nota fiscal de fornecedor ou um carnê.

- "fornecedorNome": o beneficiário / cedente / emitente (a EMPRESA que vai receber o dinheiro),
  não o pagador/sacado (que é o mercadinho).
- "fornecedorDocumento": o CNPJ (ou CPF) desse beneficiário, apenas dígitos.
- "valor": o valor a pagar. Em boleto, é o campo "Valor do documento" / "Valor cobrado".
- "vencimento": a data de vencimento, convertida pra AAAA-MM-DD.
- "documento": número da nota/boleto/fatura, se estiver visível.

Se algum campo não estiver legível, devolva "" (ou 0 para valor). Não invente CNPJ, valor nem data.`;

export async function lerContaPagarDaFoto(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<DadosContaPagar> {
  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: INSTRUCAO },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new Error("O modelo não devolveu texto.");
  }

  const j = JSON.parse(bloco.text) as Partial<DadosContaPagar>;
  return {
    fornecedorNome: (j.fornecedorNome ?? "").trim(),
    fornecedorDocumento: (j.fornecedorDocumento ?? "").replace(/\D/g, ""),
    valor: Number(j.valor) || 0,
    vencimento: /^\d{4}-\d{2}-\d{2}$/.test(j.vencimento ?? "") ? j.vencimento! : "",
    documento: (j.documento ?? "").trim(),
  };
}
