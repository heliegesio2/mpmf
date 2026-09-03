/**
 * Lê o áudio de um vídeo em que o lojista fala o nome e o preço de cada
 * produto ("Batata Mix, R$ 10. Paçoquinha, 50 centavos...") e devolve a lista
 * de { nome, preco, segundos }. Dois passos:
 *   1. transcrição do áudio com marcações de tempo (Whisper via Groq/OpenAI)
 *   2. a Claude transforma a transcrição em itens estruturados, marcando por
 *      volta de que segundo cada produto foi citado — o cliente usa isso pra
 *      pegar um quadro do vídeo e virar a foto do produto.
 *
 * Quando não dá pra entender o nome, a Claude tenta deduzir pelo contexto e
 * marca `generico: true` com um nome curto ("Cigarro (marca não identificada)").
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const MODELO = process.env.ANTHROPIC_MODEL_VIDEO || "claude-sonnet-5";

const TRANSCRICAO_URL =
  process.env.TRANSCRICAO_URL || "https://api.groq.com/openai/v1/audio/transcriptions";
const TRANSCRICAO_MODELO = process.env.TRANSCRICAO_MODELO || "whisper-large-v3-turbo";

export type ItemPrecoVideo = {
  nome: string;
  preco: number;
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
          preco: {
            type: "number",
            description: "Preço de venda em reais (ex.: 10, 0.5, 12.9). 'R$ 10 a dúzia' -> 10.",
          },
          generico: {
            type: "boolean",
            description: "true quando o nome foi deduzido porque a fala estava confusa/ininteligível.",
          },
          segundos: {
            type: "number",
            description:
              "Segundo aproximado do vídeo em que esse produto é falado (do [N] antes da frase). Use -1 se não tiver marcação.",
          },
        },
        required: ["nome", "preco", "generico", "segundos"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const;

const INSTRUCAO = `A transcrição abaixo é de um vídeo onde o dono de um mercadinho brasileiro fala,
um por um, o NOME e o PREÇO de venda de cada produto (ex.: "Batata Mix, R$ 10", "Paçoquinha,
50 centavos", "Ovos, R$ 10 a dúzia"). Cada linha começa com "[N]" = o segundo do vídeo.

Para cada produto citado, extraia:
- "nome": o nome do produto (marca + tipo). Corrija erros óbvios de transcrição de fala. Se a
  fala estiver truncada ou ininteligível, DEDUZA o produto mais provável pelo contexto (o que
  costuma ter num mercadinho, o que veio antes/depois) e dê um nome curto e genérico — nesse
  caso marque "generico": true. Ex.: som confuso perto de "cigarro" -> "Cigarro (marca não
  identificada)".
- "preco": o preço em reais como número. "50 centavos" -> 0.5. "R$ 10 a dúzia" -> 10.
- "generico": true só quando o nome foi deduzido, false quando foi entendido direto.
- "segundos": o "[N]" do começo da linha onde esse produto é citado (aproxime pra 1 s depois,
  que costuma ser quando a pessoa está mostrando o produto). -1 se não houver marcação.

Não invente produtos que não foram citados. Ignore saudações, "próximo", ruído.

Transcrição:
"""
{{TRANSCRICAO}}
"""`;

/** Passo 2: transcrição -> [{ nome, preco, generico, segundos }]. */
export async function interpretarTranscricao(
  segmentos: Segmento[],
  textoCru: string
): Promise<ItemPrecoVideo[]> {
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

  const json = JSON.parse(bloco.text) as { itens: ItemPrecoVideo[] };
  return json.itens
    .map((i) => ({
      nome: String(i.nome ?? "").trim(),
      preco: Number(i.preco),
      generico: Boolean(i.generico),
      segundos: Number.isFinite(Number(i.segundos)) ? Number(i.segundos) : -1,
    }))
    .filter((i) => i.nome.length >= 2 && Number.isFinite(i.preco) && i.preco > 0);
}

/** Pipeline completo: áudio -> itens. Devolve também a transcrição crua. */
export async function lerPrecosDoVideo(
  audio: Blob
): Promise<{ transcricao: string; itens: ItemPrecoVideo[] }> {
  const { texto, segmentos } = await transcreverAudio(audio);
  const itens = await interpretarTranscricao(segmentos, texto);
  return { transcricao: texto, itens };
}
