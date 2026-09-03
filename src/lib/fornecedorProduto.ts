/**
 * Constantes e helpers puros do catálogo do fornecedor (sem `pg`, sem DOM) —
 * usados pelas rotas de API e pelas telas (client).
 */

/** Sugestões de categoria; o campo é texto livre (trim + 40 chars). */
export const CATEGORIAS_FORNECEDOR_PRODUTO = [
  "salgadinhos",
  "sorvetes",
  "isqueiros",
  "bebidas",
  "doces",
  "biscoitos",
  "mercearia",
  "limpeza",
  "higiene",
  "hortifruti",
  "padaria",
  "congelados",
  "bomboniere",
  "utilidades",
] as const;

export type FornecedorProdutoEntrada = {
  nome: string;
  categoria: string;
  precoUnidade: number | null;
  precoDesconto: number | null;
  descontoQtdMin: number | null;
  precoCaixa: number | null;
  caixaQtd: number | null;
  /** tri-state: undefined mantém, "" limpa, data URL troca. */
  foto?: string;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const inteiro = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

/** Valida/normaliza o corpo de criar/editar produto. */
export function lerEntradaProduto(
  corpo: Record<string, unknown>
): FornecedorProdutoEntrada | { erro: string } {
  const nome = String(corpo.nome ?? "").trim();
  if (nome.length < 2) return { erro: "Informe o nome do produto." };

  const precoUnidade = num(corpo.precoUnidade);
  const precoCaixa = num(corpo.precoCaixa);
  if (precoUnidade === null && precoCaixa === null) {
    return { erro: "Informe pelo menos o preço por unidade ou o preço da caixa." };
  }

  const foto = corpo.foto;
  return {
    nome,
    categoria: String(corpo.categoria ?? "").trim().slice(0, 40),
    precoUnidade,
    precoDesconto: num(corpo.precoDesconto),
    descontoQtdMin: inteiro(corpo.descontoQtdMin),
    precoCaixa,
    caixaQtd: inteiro(corpo.caixaQtd),
    foto:
      foto === undefined
        ? undefined
        : typeof foto === "string" && (foto === "" || foto.startsWith("data:image/"))
          ? foto
          : undefined,
  };
}

/** Linhas de preço prontas pra exibir ("un R$ 2,50", "10+ un R$ 2,20", ...). */
export function linhasDePreco(p: {
  preco_unidade: number | null;
  preco_desconto: number | null;
  desconto_qtd_min: number | null;
  preco_caixa: number | null;
  caixa_qtd: number | null;
}): string[] {
  const reais = (v: number) =>
    "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const linhas: string[] = [];
  if (p.preco_unidade != null) linhas.push(`un ${reais(p.preco_unidade)}`);
  if (p.preco_desconto != null && p.desconto_qtd_min)
    linhas.push(`${p.desconto_qtd_min}+ un ${reais(p.preco_desconto)}`);
  if (p.preco_caixa != null)
    linhas.push(`${p.caixa_qtd ? `caixa ${p.caixa_qtd} un` : "caixa"} ${reais(p.preco_caixa)}`);
  return linhas;
}
