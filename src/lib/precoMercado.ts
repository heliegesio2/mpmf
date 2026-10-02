/**
 * Pesquisa o preco medio de venda no varejo brasileiro de produtos sem preco
 * cadastrado — sem API de precos dedicada, usa a ferramenta de busca na web
 * da propria Claude (web_search) pra pesquisar e sintetizar a media, citando
 * as lojas/sites usados no calculo.
 *
 * Processa varios produtos numa chamada so (o modelo faz uma busca por
 * produto dentro da mesma mensagem) — mais barato e rapido que uma chamada
 * por produto, e evita estourar o tempo limite da funcao serverless.
 */

import Anthropic from "@anthropic-ai/sdk";
import { semAcento } from "@/lib/voz";

const client = new Anthropic();

/** Tarefa de texto/sintese, nao precisa da precisao visual do Opus. */
const MODELO = process.env.ANTHROPIC_MODEL_VIDEO || "claude-sonnet-5";

/** Teto por chamada — cada produto custa pelo menos uma busca na web. */
export const MAX_PRODUTOS_POR_LOTE = 10;

export type ProdutoConsulta = { id: number; nome: string };

export type ItemPrecoMercado = {
  id: number;
  nome: string;
  precoMedio: number | null;
  fonte: string | null;
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
            description: "Copie o nome do produto exatamente como esta na lista recebida.",
          },
          precoMedio: {
            type: ["number", "null"],
            description:
              "Preco medio de venda no varejo brasileiro, em reais. null se nao achar nada confiavel.",
          },
          fonte: {
            type: ["string", "null"],
            description:
              "Nomes das lojas/sites usados pra calcular essa media (ex.: 'Carrefour, Pao de Acucar, Extra'). null se precoMedio for null.",
          },
        },
        required: ["nome", "precoMedio", "fonte"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `Para cada produto da lista numerada abaixo, pesquise na web o preco medio de
venda no varejo brasileiro (supermercados/mercadinhos, em reais) e devolva, na mesma ordem, um
item em "itens" com:
- "nome": copie exatamente como esta na lista.
- "precoMedio": o preco medio encontrado, em reais (numero). Se nao achar nenhum preco confiavel
  pra esse produto, use null.
- "fonte": os nomes das lojas/sites que voce usou pra calcular essa media. null se precoMedio for
  null.

Nao invente preco. Devolva um item pra cada produto da lista, na ordem dada.

Produtos:
{{LISTA}}`;

function normalizar(nome: string): string {
  return semAcento(nome).toLowerCase().trim();
}

export async function buscarPrecoMedioMercado(
  produtos: ProdutoConsulta[]
): Promise<ItemPrecoMercado[]> {
  const lista = produtos.map((p, i) => `${i + 1}. ${p.nome}`).join("\n");

  const resposta = await client.messages.create({
    model: MODELO,
    max_tokens: 8000,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: produtos.length * 2,
        user_location: { type: "approximate", country: "BR" },
      },
    ],
    messages: [{ role: "user", content: INSTRUCAO.replace("{{LISTA}}", lista) }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") {
    throw new Error("O modelo não devolveu texto.");
  }

  const json = JSON.parse(bloco.text) as {
    itens: { nome: string; precoMedio: number | null; fonte: string | null }[];
  };

  // casa por nome (o modelo as vezes reordena ou pula algum); cai pra posicao se nao achar.
  return produtos.map((p, i) => {
    const porNome = json.itens.find((it) => normalizar(it.nome) === normalizar(p.nome));
    const item = porNome ?? json.itens[i];
    const precoMedio =
      item && typeof item.precoMedio === "number" && Number.isFinite(item.precoMedio) && item.precoMedio > 0
        ? Math.round(item.precoMedio * 100) / 100
        : null;
    return {
      id: p.id,
      nome: p.nome,
      precoMedio,
      fonte: precoMedio !== null ? (item?.fonte ?? null) : null,
    };
  });
}
