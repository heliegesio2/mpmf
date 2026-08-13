/** Como o preco e cobrado. Precisa bater com a constraint produto_tipo_venda_check. */
export const TIPOS_VENDA = [
  { valor: "unidade", rotulo: "Unidade", sufixo: "un" },
  { valor: "quilo", rotulo: "Quilo", sufixo: "kg" },
  { valor: "duzia", rotulo: "Dúzia", sufixo: "dz" },
] as const;

export type TipoVenda = (typeof TIPOS_VENDA)[number]["valor"];

export function sufixo(tipo: string): string {
  return TIPOS_VENDA.find((t) => t.valor === tipo)?.sufixo ?? "un";
}

export function rotuloTipo(tipo: string): string {
  return TIPOS_VENDA.find((t) => t.valor === tipo)?.rotulo ?? "Unidade";
}

/**
 * Embalagem: descreve o formato em que o produto fica na prateleira.
 * E so descritivo — quem manda no preco e o tipo de venda.
 * Os valores em minusculo batem com o que ja esta no banco vindo do inventario.
 */
export const EMBALAGENS = [
  { valor: "unidade", rotulo: "Unidade" },
  { valor: "pacote", rotulo: "Pacote" },
  { valor: "fardo", rotulo: "Fardo" },
  { valor: "caixa", rotulo: "Caixa" },
  { valor: "cartela", rotulo: "Cartela" },
  { valor: "bandeja", rotulo: "Bandeja" },
  { valor: "saco", rotulo: "Saco" },
  { valor: "sache", rotulo: "Sachê" },
  { valor: "pote", rotulo: "Pote" },
  { valor: "lata", rotulo: "Lata" },
  { valor: "garrafa", rotulo: "Garrafa" },
  { valor: "garrafao", rotulo: "Garrafão" },
  { valor: "galao", rotulo: "Galão" },
  { valor: "vidro", rotulo: "Vidro" },
  { valor: "frasco", rotulo: "Frasco" },
  { valor: "tubo", rotulo: "Tubo" },
  { valor: "barra", rotulo: "Barra" },
  { valor: "rolo", rotulo: "Rolo" },
  { valor: "engradado", rotulo: "Engradado" },
  { valor: "bacia", rotulo: "Bacia" },
  { valor: "balde", rotulo: "Balde" },
  { valor: "maco", rotulo: "Maço" },
  { valor: "cacho", rotulo: "Cacho" },
  { valor: "penca", rotulo: "Penca" },
  { valor: "bandeja-ovos", rotulo: "Bandeja de ovos" },
  { valor: "display", rotulo: "Display" },
  { valor: "refil", rotulo: "Refil" },
  { valor: "granel", rotulo: "Granel" },
] as const;

export function rotuloEmbalagem(valor: string): string {
  return EMBALAGENS.find((e) => e.valor === valor)?.rotulo ?? valor;
}
