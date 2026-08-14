/** Utilitários para transformar fala em valor de campo. */

export function semAcento(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, meio: 0.5, meia: 0.5, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19,
};

const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
};

const CENTENAS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400,
  quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800,
  novecentos: 900,
};

/** "cento e cinquenta" -> 150 | "quatro" -> 4 | "12" -> 12 */
export function frasePraNumero(frase: string): number | null {
  const palavras = semAcento(frase)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && p !== "e");

  if (palavras.length === 0) return null;

  let total = 0;
  let achou = false;

  for (const p of palavras) {
    if (/^\d+$/.test(p)) {
      total += Number(p);
      achou = true;
    } else if (p === "mil") {
      total = (total || 1) * 1000;
      achou = true;
    } else if (p in CENTENAS) {
      total += CENTENAS[p];
      achou = true;
    } else if (p in DEZENAS) {
      total += DEZENAS[p];
      achou = true;
    } else if (p in UNIDADES) {
      total += UNIDADES[p];
      achou = true;
    }
  }

  return achou ? total : null;
}

/**
 * Interpreta um valor falado e devolve pronto para o campo, com vírgula.
 *   "4,50"                          -> "4,50"
 *   "quatro reais e cinquenta"      -> "4,50"
 *   "sete e noventa"                -> "7,90"
 *   "doze"                          -> "12"
 *   "cento e cinquenta"             -> "150"
 * Devolve null quando não reconheceu nenhum número.
 */
export function numeroFalado(fala: string): string | null {
  const t = semAcento(fala);

  // já veio como dígitos: "4,50" | "4.50" | "R$ 4,50"
  const digitos = t.match(/(\d+)[.,](\d{1,2})/);
  if (digitos) return `${Number(digitos[1])},${digitos[2].padEnd(2, "0")}`;

  // separadores explícitos de centavos
  const marcador = t.match(/^(.*?)\s*(?:reais|real|virgula|ponto)\s*(.*)$/);
  if (marcador) {
    const inteiro = frasePraNumero(marcador[1]) ?? 0;
    const resto = marcador[2].replace(/centavos?/g, "").trim();
    const centavos = resto ? frasePraNumero(resto) : null;
    if (centavos === null) return String(inteiro);
    return `${inteiro},${String(centavos).padStart(2, "0").slice(0, 2)}`;
  }

  // "sete e noventa" -> 7,90 (só quando a primeira parte não é composta)
  const partes = t.split(/\s+e\s+/);
  if (partes.length === 2 && !/cento|centos|mil|cem/.test(partes[0])) {
    const a = frasePraNumero(partes[0]);
    const b = frasePraNumero(partes[1]);
    if (a !== null && b !== null && b < 100) {
      return `${a},${String(b).padStart(2, "0")}`;
    }
  }

  const n = frasePraNumero(t);
  return n === null ? null : String(n);
}

/** Escolhe a opção da lista que mais se aproxima do que foi falado. */
export function opcaoFalada(
  fala: string,
  opcoes: readonly { valor: string; rotulo: string }[]
): string | null {
  const t = semAcento(fala);
  if (!t) return null;

  const exata = opcoes.find(
    (o) => semAcento(o.rotulo) === t || o.valor === t
  );
  if (exata) return exata.valor;

  const contem = opcoes.find(
    (o) => t.includes(semAcento(o.rotulo)) || semAcento(o.rotulo).includes(t)
  );
  return contem?.valor ?? null;
}

/** Primeira letra maiúscula: o reconhecimento devolve tudo minúsculo. */
export function capitalizar(t: string): string {
  const s = t.trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const MARCADORES_VALOR = new Set([
  "reais", "real", "centavos", "centavo", "virgula", "ponto", "conto", "contos",
]);

/** A palavra faz parte de um valor falado (numero, conector ou marcador tipo "reais")? */
function ehTokenDeValor(palavraCrua: string): boolean {
  const p = semAcento(palavraCrua).replace(/[,.;:]+$/, "");
  if (!p) return false;
  if (/^\d+([.,]\d{1,2})?$/.test(p)) return true;
  if (p === "e" || p === "mil") return true;
  if (p in UNIDADES || p in DEZENAS || p in CENTENAS) return true;
  return MARCADORES_VALOR.has(p);
}

/**
 * Separa uma fala tipo "gelo, quarenta reais" em servico + valor, pegando
 * o valor sempre do final da frase (onde a pessoa costuma falar o preco).
 * Devolve null quando nao acha nenhum valor falado no fim da frase.
 */
export function separarServicoValor(
  fala: string
): { servico: string; valor: string } | null {
  const palavras = fala.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return null;

  let corte = palavras.length;
  while (corte > 0 && ehTokenDeValor(palavras[corte - 1])) corte--;

  if (corte === palavras.length || corte === 0) return null;

  const valor = numeroFalado(palavras.slice(corte).join(" "));
  if (valor === null) return null;

  const servico = palavras
    .slice(0, corte)
    .join(" ")
    .replace(/[,;]+$/, "")
    .trim();
  if (!servico) return null;

  return { servico: capitalizar(servico), valor };
}
