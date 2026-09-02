import { frasePraNumero, semAcento } from "./voz";

export type ItemFalado = {
  /** Quantidade: peças quando emPeso é falso, quilos quando é verdadeiro. */
  quantidade: number;
  emPeso: boolean;
  /** O que sobrou da frase, usado para procurar o produto. */
  termo: string;
  /**
   * Quando o caixa fala um VALOR em vez de quantidade ("dez reais de tomate"),
   * guarda o valor em reais. A quantidade sai de valor / preço do produto.
   */
  valorReais?: number;
};

/** Palavras de peso reconhecidas e quanto valem em quilo. */
const PESOS: { padrao: RegExp; fator: number }[] = [
  { padrao: /\b(gramas?|grama|g)\b/, fator: 0.001 },
  { padrao: /\b(quilos?|kg|kilos?|quilogramas?)\b/, fator: 1 },
];

/** Palavras que marcam dinheiro na fala. */
const MOEDA = /(reais|real|contos?|pilas?|paus?|conto)/;

/** Ruído que não ajuda a achar o produto. */
const DESCARTE =
  /^(de|do|da|dos|das|em|no|na|um|uma|uns|umas|o|a|os|as|por favor|me ve|me da|mais)\s+/;

/**
 * O reconhecimento de fala do Chrome em pt-BR transcreve "dez reais" como
 * "R$ 10" — então "dez reais de tomate" chega como "R$ 10 de tomate", e o
 * "$" é jogado fora antes de dar pra reconhecer o dinheiro. Aqui, antes de
 * limpar a pontuação, todo "R$ 10" / "10 R$" vira "10 reais".
 */
function normalizarMoeda(t: string): string {
  return t
    .replace(/r\$\s*(\d+(?:[.,]\d+)?)/g, " $1 reais ")
    .replace(/(\d+(?:[.,]\d+)?)\s*r\$/g, " $1 reais ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "duzentos gramas de tomate"  -> { quantidade: 0.2,  emPeso: true,  termo: "tomate" }
 * "um maco de cigarro"         -> { quantidade: 1,    emPeso: false, termo: "maco de cigarro" }
 * "meio quilo de maca"         -> { quantidade: 0.5,  emPeso: true,  termo: "maca" }
 * "tres pirulitos"             -> { quantidade: 3,    emPeso: false, termo: "pirulitos" }
 * "leite"                      -> { quantidade: 1,    emPeso: false, termo: "leite" }
 */
export function interpretarItem(fala: string): ItemFalado | null {
  let t = normalizarMoeda(semAcento(fala))
    .replace(/[^a-z0-9\s,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;

  let quantidade = 1;
  let emPeso = false;

  // 1. quantidade no começo da frase, em dígitos ou por extenso
  const emDigitos = t.match(/^(\d+(?:[.,]\d+)?)\s+/);
  if (emDigitos) {
    quantidade = Number(emDigitos[1].replace(",", "."));
    t = t.slice(emDigitos[0].length);
  } else {
    // consome palavras de número até encontrar algo que não seja número
    const palavras = t.split(" ");
    const numericas: string[] = [];
    for (const p of palavras) {
      if (p === "e" && numericas.length > 0) {
        numericas.push(p);
        continue;
      }
      if (frasePraNumero(p) === null) break;
      numericas.push(p);
    }
    // "e" solto no fim não conta
    while (numericas.at(-1) === "e") numericas.pop();

    if (numericas.length > 0) {
      const n = frasePraNumero(numericas.join(" "));
      if (n !== null) {
        quantidade = n;
        t = palavras.slice(numericas.length).join(" ");
      }
    }
  }

  // 2a. "dez reais de tomate" — o número falado era dinheiro, não quantidade
  let valorReais: number | undefined;
  const moedaInicio = t.match(new RegExp("^" + MOEDA.source + "\\b\\s*"));
  if (moedaInicio && quantidade > 0) {
    valorReais = quantidade;
    quantidade = 1;
    t = t.slice(moedaInicio[0].length).trim();
  }

  // 2b. unidade de peso logo depois da quantidade
  if (valorReais === undefined) {
    for (const { padrao, fator } of PESOS) {
      const m = t.match(new RegExp("^" + padrao.source.replace(/\\b/g, "") + "\\b"));
      if (m) {
        emPeso = true;
        quantidade = quantidade * fator;
        t = t.slice(m[0].length).trim();
        break;
      }
    }
  }

  // 2c. dinheiro no fim: "tomate (de) dez reais" | "tomate 10 reais"
  if (valorReais === undefined) {
    // pega só o último token (ou "cento e cinquenta") logo antes de "reais"
    const fim = t.match(new RegExp("\\s+(?:de\\s+)?([^\\s]+(?:\\s+e\\s+[^\\s]+)?)\\s+" + MOEDA.source + "\\s*$"));
    if (fim) {
      const bruto = fim[1].trim();
      const tokens = bruto.split(/\s+/).filter((w) => w && w !== "e");
      const soNumeros =
        tokens.length > 0 &&
        tokens.every((w) => /^\d+(?:[.,]\d+)?$/.test(w) || frasePraNumero(w) !== null);
      const n = /^\d/.test(bruto) ? Number(bruto.replace(",", ".")) : frasePraNumero(bruto);
      if (soNumeros && n !== null && n > 0) {
        valorReais = n;
        t = t.slice(0, fim.index!).trim();
      }
    }
  }

  // "um quilo e meio de tomate" -> sobra "e meio de tomate"
  const meio = t.match(/^e\s+(meio|meia)\b/);
  if (meio && emPeso) {
    quantidade += 0.5;
    t = t.slice(meio[0].length).trim();
  }

  // 3. limpa conectivos até sobrar o nome do produto
  let anterior = "";
  while (t !== anterior) {
    anterior = t;
    t = t.replace(DESCARTE, "").trim();
  }
  // tira pontuação que sobra nas pontas ("tomate." quando a fala termina com ponto)
  t = t.replace(/^[,.\s]+|[,.\s]+$/g, "");

  if (!t) return null;

  return {
    quantidade: Number(quantidade.toFixed(3)),
    emPeso,
    termo: t,
    ...(valorReais !== undefined ? { valorReais: Number(valorReais.toFixed(2)) } : {}),
  };
}

/** Formata a quantidade conforme o tipo de venda do produto. */
export function formatarQuantidade(qtd: number, tipoVenda: string): string {
  if (tipoVenda === "quilo") {
    return qtd < 1 ? `${Math.round(qtd * 1000)} g` : `${qtd.toString().replace(".", ",")} kg`;
  }
  if (tipoVenda === "duzia") return `${qtd} dz`;
  return `${qtd} un`;
}
