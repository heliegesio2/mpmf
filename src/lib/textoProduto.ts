/** Normaliza um nome de produto pra agrupar (sem acento, minúsculo, só letras/números). Puro. */
export function normalizarNomeProduto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const UNIDADES =
  "kg|kgs|quilos?|g|gr|gramas?|mg|ml|l|lt|lts|litros?|un|und|unid|dz|duzia|cx|caixa|pct|pacote|pc|pote|potes|garrafa|lata|latas|fardo|saco|rolo|rolos|par|pares|c\\/\\s*\\d+";

/**
 * Variações de busca pra achar o mesmo produto cadastrado com outro nome:
 * o nome cru, o nome sem peso/embalagem, e as 3 primeiras palavras (marca+tipo).
 */
export function variantesBuscaProduto(nome: string): string[] {
  const cru = nome.trim();
  const semUnidade = cru
    .replace(new RegExp(`\\b\\d+([.,]\\d+)?\\s*(${UNIDADES})\\b`, "gi"), " ")
    .replace(new RegExp(`\\b(${UNIDADES})\\b`, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();

  const out = new Set<string>();
  if (cru.length >= 2) out.add(cru);
  if (semUnidade.length >= 3) out.add(semUnidade);
  const palavras = semUnidade.split(" ").filter((p) => p.length >= 2);
  if (palavras.length >= 2) out.add(palavras.slice(0, 3).join(" "));
  return [...out];
}
