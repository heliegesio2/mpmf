import { frasePraNumero, semAcento } from "./voz";

export type ItemFalado = {
  /** Quantidade: peças quando emPeso é falso, quilos quando é verdadeiro. */
  quantidade: number;
  emPeso: boolean;
  /** O que sobrou da frase, usado para procurar o produto. */
  termo: string;
};

/** Palavras de peso reconhecidas e quanto valem em quilo. */
const PESOS: { padrao: RegExp; fator: number }[] = [
  { padrao: /\b(gramas?|grama|g)\b/, fator: 0.001 },
  { padrao: /\b(quilos?|kg|kilos?|quilogramas?)\b/, fator: 1 },
];

/** Ruído que não ajuda a achar o produto. */
const DESCARTE =
  /^(de|do|da|dos|das|um|uma|uns|umas|o|a|os|as|por favor|me ve|me da|mais)\s+/;

/**
 * "duzentos gramas de tomate"  -> { quantidade: 0.2,  emPeso: true,  termo: "tomate" }
 * "um maco de cigarro"         -> { quantidade: 1,    emPeso: false, termo: "maco de cigarro" }
 * "meio quilo de maca"         -> { quantidade: 0.5,  emPeso: true,  termo: "maca" }
 * "tres pirulitos"             -> { quantidade: 3,    emPeso: false, termo: "pirulitos" }
 * "leite"                      -> { quantidade: 1,    emPeso: false, termo: "leite" }
 */
export function interpretarItem(fala: string): ItemFalado | null {
  let t = semAcento(fala).replace(/[^a-z0-9\s,.]/g, " ").replace(/\s+/g, " ").trim();
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

  // 2. unidade de peso logo depois da quantidade
  for (const { padrao, fator } of PESOS) {
    const m = t.match(new RegExp("^" + padrao.source.replace(/\\b/g, "") + "\\b"));
    if (m) {
      emPeso = true;
      quantidade = quantidade * fator;
      t = t.slice(m[0].length).trim();
      break;
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

  if (!t) return null;

  return { quantidade: Number(quantidade.toFixed(3)), emPeso, termo: t };
}

/** Formata a quantidade conforme o tipo de venda do produto. */
export function formatarQuantidade(qtd: number, tipoVenda: string): string {
  if (tipoVenda === "quilo") {
    return qtd < 1 ? `${Math.round(qtd * 1000)} g` : `${qtd.toString().replace(".", ",")} kg`;
  }
  if (tipoVenda === "duzia") return `${qtd} dz`;
  return `${qtd} un`;
}
