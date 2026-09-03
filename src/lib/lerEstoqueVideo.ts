/**
 * Lê o áudio de um vídeo em que o lojista fala, produto por produto, o NOME e
 * um ou dois números: a QUANTIDADE em estoque e/ou o PREÇO de venda
 * ("Batata Mix, 12 unidades". "Paçoquinha, 50 centavos". "Arroz, 8 pacotes,
 * R$ 25"). Dois passos:
 *   1. transcrição do áudio com marcações de tempo (Whisper via Groq/OpenAI)
 *   2. a Claude transforma a transcrição em { nome, quantidade, preco, ... }
 *
 * Quando não dá pra entender o nome, a Claude deduz pelo contexto e marca
 * `generico: true` com um nome curto ("Cigarro (marca não identificada)").
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const MODELO = process.env.ANTHROPIC_MODEL_VIDEO || "claude-sonnet-5";

const TRANSCRICAO_URL =
  process.env.TRANSCRICAO_URL || "https://api.groq.com/openai/v1/audio/transcriptions";
const TRANSCRICAO_MODELO = process.env.TRANSCRICAO_MODELO || "whisper-large-v3-turbo";

export type ItemEstoqueVideo = {
  nome: string;
  /** quantidade em estoque falada, ou null se não foi dita. */
  quantidade: number | null;
  /** preço de venda falado (reais), ou null se não foi dito. */
  preco: number | null;
  /** true quando o nome foi deduzido porque a fala não deu pra entender. */
  generico: boolean;
  /** segundo aproximado do vídeo em que o produto aparece (-1 se não deu). */
  segundos: number;
};

export function transcricaoConfigurada(): boolean {
  return Boolean(process.env.TRANSCRICAO_API_KEY?.trim());
}

type Segmento = { start: number; text: string };

/** Passo 1: áudio -> texto + segmentos com tempo. */
export async function transcreverAudio(
  audio: Blob
): Promise<{ texto: string; segmentos: Segmento[] }> {
  const chave = process.env.TRANSCRICAO_API_KEY?.trim();
  if (!chave) {
    throw new Error(
      "A transcrição de áudio não está configurada (defina TRANSCRICAO_API_KEY no ambiente)."
    );
  }

  const form = new FormData();
  form.append("file", audio, "audio.wav");
  form.append("model", TRANSCRICAO_MODELO);
  form.append("language", "pt");
  form.append("response_format", "verbose_json");

  const r = await fetch(TRANSCRICAO_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
  });

  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    throw new Error(`Falha na transcrição (${r.status}). ${detalhe.slice(0, 200)}`);
  }

  const j = (await r.json()) as { text?: string; segments?: { start: number; text: string }[] };
  const segmentos = (j.segments ?? []).map((s) => ({
    start: Number(s.start) || 0,
    text: String(s.text ?? "").trim(),
  }));
  return { texto: (j.text ?? segmentos.map((s) => s.text).join(" ")).trim(), segmentos };
}

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
            description:
              "Nome do produto como falado. Se não deu pra entender, deduza pelo contexto e dê um nome curto e genérico.",
          },
          quantidade: {
            type: "number",
            description:
              "Quantidade em estoque falada (um número solto: '12', '10 unidades', 'uma dúzia'->12). -1 se a pessoa não falou quantidade.",
          },
          preco: {
            type: "number",
            description:
              "Preço de venda em reais, quando falado ('R$ 10', '10 reais', '50 centavos'->0.5, 'R$ 10 a dúzia'->10). -1 se não falou preço.",
          },
          generico: {
            type: "boolean",
            description: "true quando o nome foi deduzido porque a fala estava confusa/ininteligível.",
          },
          segundos: {
            type: "number",
            description:
              "Segundo aproximado do vídeo em que esse produto é falado (do [N] antes da frase). -1 se não tiver marcação.",
          },
        },
        required: ["nome", "quantidade", "preco", "generico", "segundos"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `A transcrição abaixo é de um vídeo onde o dono de um mercadinho brasileiro passa
produto por produto contando o ESTOQUE. Para cada produto ele fala o NOME e um ou dois números:
a QUANTIDADE em estoque e, às vezes, também o PREÇO de venda.
Exemplos: "Batata Mix, 12 pacotes" (só quantidade). "Paçoquinha, 50 centavos" (só preço).
"Arroz, 8 sacos, R$ 25" (quantidade e preço). Cada linha começa com "[N]" = o segundo do vídeo.

Regras pra separar os números:
- Tem "R$", "reais", "real", "centavos", ou "a dúzia"/"o quilo" -> é PREÇO.
- Número solto, "unidades", "pacotes", "caixas", "uma dúzia" (=12), "meia dúzia" (=6) -> é QUANTIDADE.
- Pode ter os dois na mesma fala.

Para cada produto:
- "nome": marca + tipo. Corrija erros óbvios de transcrição de fala. Se a fala estiver truncada
  ou ininteligível, DEDUZA o produto mais provável pelo contexto e dê um nome curto e genérico —
  nesse caso "generico": true. Ex.: som confuso perto de "cigarro" -> "Cigarro (marca não identificada)".
- "quantidade": a quantidade em estoque como número. -1 se ele não falou quantidade.
- "preco": o preço em reais como número. -1 se ele não falou preço.
- "generico": true só quando o nome foi deduzido.
- "segundos": o "[N]" do começo da linha onde o produto aparece. -1 se não houver.

Não invente produtos que não foram citados. Ignore saudações, "próximo", ruído.

Transcrição:
"""
{{TRANSCRICAO}}
"""`;

/** Passo 2: transcrição -> [{ nome, quantidade, preco, generico, segundos }]. */
export async function interpretarTranscricao(
  segmentos: Segmento[],
  textoCru: string
): Promise<ItemEstoqueVideo[]> {
  const corpo =
    segmentos.length > 0
      ? segmentos.map((s) => `[${Math.round(s.start)}] ${s.text}`).join("\n")
      : textoCru;
  if (!corpo.trim()) return [];

  const resposta = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 4000,
    messages: [
      { role: "user", content: INSTRUCAO.replace("{{TRANSCRICAO}}", corpo.slice(0, 8000)) },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const bloco = resposta.content.find((b) => b.type === "text");
  if (!bloco || bloco.type !== "text") throw new Error("O modelo não devolveu texto.");

  const json = JSON.parse(bloco.text) as { itens: ItemEstoqueVideo[] };
  const limpo = (n: unknown): number | null => {
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  return json.itens
    .map((i) => ({
      nome: String(i.nome ?? "").trim(),
      quantidade: limpo(i.quantidade),
      preco: limpo(i.preco),
      generico: Boolean(i.generico),
      segundos: Number.isFinite(Number(i.segundos)) ? Number(i.segundos) : -1,
    }))
    .filter((i) => i.nome.length >= 2 && (i.quantidade !== null || i.preco !== null));
}

/** Pipeline completo: áudio -> itens. Devolve também a transcrição crua. */
export async function lerEstoqueDoVideo(
  audio: Blob
): Promise<{ transcricao: string; itens: ItemEstoqueVideo[] }> {
  const { texto, segmentos } = await transcreverAudio(audio);
  const itens = await interpretarTranscricao(segmentos, texto);
  return { transcricao: texto, itens };
}
