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

/**
 * Como o fornecedor vende o produto ("venda por"). `sing`/`plural` são os
 * rótulos curtos usados em preços e pedidos ("2 caixas", "5 kg").
 */
export const TIPOS_VENDA = [
  { valor: "unidade", rotulo: "Unidade", sing: "un", plural: "un" },
  { valor: "caixa", rotulo: "Caixa", sing: "caixa", plural: "caixas" },
  { valor: "quilo", rotulo: "Quilo", sing: "kg", plural: "kg" },
  { valor: "fardo", rotulo: "Fardo", sing: "fardo", plural: "fardos" },
  { valor: "pacote", rotulo: "Pacote", sing: "pacote", plural: "pacotes" },
  { valor: "duzia", rotulo: "Dúzia", sing: "dúzia", plural: "dúzias" },
  { valor: "saco", rotulo: "Saco", sing: "saco", plural: "sacos" },
  { valor: "bandeja", rotulo: "Bandeja", sing: "bandeja", plural: "bandejas" },
  { valor: "litro", rotulo: "Litro", sing: "L", plural: "L" },
] as const;

export type TipoVenda = (typeof TIPOS_VENDA)[number]["valor"];

export function tipoVendaValido(v: unknown): v is TipoVenda {
  return TIPOS_VENDA.some((t) => t.valor === v);
}

/** Código de unidade usado no pedido: "unidade" vira "un"; o resto é o próprio tipo. */
export const codigoDoTipo = (tipo: string): string => (tipo === "unidade" ? "un" : tipo);

/** "un" | "caixa" | "quilo" … → tipo cadastrado (ou `null`). */
function tipoDoCodigo(codigo: string) {
  const t = codigo === "un" ? "unidade" : codigo;
  return TIPOS_VENDA.find((x) => x.valor === t) ?? null;
}

/** Rótulo curto de uma unidade pra uma certa quantidade ("un", "caixa"/"caixas", "kg"). */
export function rotuloUnidade(codigo: string, qtd = 1): string {
  const t = tipoDoCodigo(codigo);
  if (!t) return codigo;
  return qtd === 1 ? t.sing : t.plural;
}

export type FornecedorProdutoEntrada = {
  nome: string;
  categoria: string;
  tipoVenda: TipoVenda;
  /** Preço por unidade — só preenchido quando o tipo NÃO é caixa (é o preço do tipo). */
  precoUnidade: number | null;
  /** Preço da caixa — só preenchido quando o tipo é caixa. */
  precoCaixa: number | null;
  /** Derivado do percentual (informativo; a regra usa `descontoPct`). */
  precoDesconto: number | null;
  descontoQtdMin: number | null;
  descontoPct: number | null;
  /** Unidades por caixa (só no tipo caixa). */
  caixaQtd: number | null;
  /** Tipo caixa: também aceita pedido por unidade avulsa. */
  permiteUnidade: boolean;
  aceitaUrgencia: boolean;
  /** Taxa cobrada no pedido urgente; `null` = sem taxa. */
  taxaUrgencia: number | null;
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
const arred = (n: number) => Math.round(n * 100) / 100;

/** Valida/normaliza o corpo de criar/editar produto. */
export function lerEntradaProduto(
  corpo: Record<string, unknown>
): FornecedorProdutoEntrada | { erro: string } {
  const nome = String(corpo.nome ?? "").trim();
  if (nome.length < 2) return { erro: "Informe o nome do produto." };

  const tipoVenda: TipoVenda = tipoVendaValido(corpo.tipoVenda) ? corpo.tipoVenda : "unidade";
  const tipo = TIPOS_VENDA.find((t) => t.valor === tipoVenda)!;
  const ehCaixa = tipoVenda === "caixa";

  const preco = num(corpo.preco);
  if (preco === null || preco <= 0) {
    return { erro: `Informe o preço por ${tipo.rotulo.toLowerCase()}.` };
  }

  const caixaQtd = ehCaixa ? inteiro(corpo.caixaQtd) : null;
  const permiteUnidade = ehCaixa && Boolean(corpo.permiteUnidade);
  if (permiteUnidade && !caixaQtd) {
    return { erro: "Pra vender também por unidade, informe quantas unidades vêm na caixa." };
  }

  const descontoPct = num(corpo.descontoPct);
  const descontoQtdMin = inteiro(corpo.descontoQtdMin);
  const temDesconto = Boolean(descontoPct) || Boolean(descontoQtdMin);
  if (temDesconto) {
    if (descontoPct === null || descontoPct <= 0 || descontoPct >= 100) {
      return { erro: "No desconto, informe o percentual (entre 0 e 100)." };
    }
    if (descontoQtdMin === null || descontoQtdMin < 2) {
      return { erro: "No desconto, informe a quantidade mínima (2 ou mais)." };
    }
  }

  const aceitaUrgencia = Boolean(corpo.aceitaUrgencia);
  const taxaUrgencia = aceitaUrgencia ? num(corpo.taxaUrgencia) : null;

  const foto = corpo.foto;
  return {
    nome,
    categoria: String(corpo.categoria ?? "").trim().slice(0, 40),
    tipoVenda,
    precoUnidade: ehCaixa ? null : preco,
    precoCaixa: ehCaixa ? preco : null,
    precoDesconto: temDesconto && !ehCaixa ? arred(preco * (1 - descontoPct! / 100)) : null,
    descontoQtdMin: temDesconto ? descontoQtdMin : null,
    descontoPct: temDesconto ? descontoPct : null,
    caixaQtd,
    permiteUnidade,
    aceitaUrgencia,
    taxaUrgencia,
    foto:
      foto === undefined
        ? undefined
        : typeof foto === "string" && (foto === "" || foto.startsWith("data:image/"))
          ? foto
          : undefined,
  };
}

/** Campos de preço de um produto do fornecedor (como vêm do banco). */
export type PrecoProduto = {
  tipo_venda?: string | null;
  preco_unidade: number | null;
  preco_desconto: number | null;
  desconto_qtd_min: number | null;
  desconto_pct?: number | null;
  preco_caixa: number | null;
  caixa_qtd: number | null;
  permite_unidade?: boolean | null;
};

export type OpcaoPedido = {
  /** "un" | "caixa" | "quilo" | … */
  codigo: string;
  preco: number;
  /** A unidade em que o produto é vendido (o desconto por quantidade vale só nela). */
  principal: boolean;
};

/**
 * Em que unidades o produto pode ser pedido, com o preço-base de cada uma.
 * Produtos antigos (anteriores ao `db/44`) têm `tipo_venda = 'unidade'` e
 * podem trazer `preco_caixa` junto — viram duas opções.
 */
export function opcoesDePedido(p: PrecoProduto): OpcaoPedido[] {
  const tipo = p.tipo_venda || "unidade";
  const out: OpcaoPedido[] = [];
  if (tipo === "caixa") {
    if (p.preco_caixa != null) {
      out.push({ codigo: "caixa", preco: p.preco_caixa, principal: true });
      if (p.permite_unidade && p.caixa_qtd) {
        out.push({ codigo: "un", preco: arred(p.preco_caixa / p.caixa_qtd), principal: false });
      }
    }
  } else if (tipo === "unidade") {
    if (p.preco_unidade != null) out.push({ codigo: "un", preco: p.preco_unidade, principal: true });
    if (p.preco_caixa != null) out.push({ codigo: "caixa", preco: p.preco_caixa, principal: false });
  } else if (p.preco_unidade != null) {
    out.push({ codigo: tipo, preco: p.preco_unidade, principal: true });
  }
  return out;
}

/** Preço unitário final (com desconto por quantidade, se valer). */
export function precoDaOpcao(p: PrecoProduto, op: OpcaoPedido, qtd: number): number {
  const min = p.desconto_qtd_min;
  if (min != null && qtd >= min) {
    if (op.principal && p.desconto_pct) return arred(op.preco * (1 - p.desconto_pct / 100));
    // legado: desconto em valor absoluto, só pra unidade
    if (!p.desconto_pct && p.preco_desconto != null && op.codigo === "un" && op.principal) {
      return p.preco_desconto;
    }
  }
  return op.preco;
}

const reais = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Linhas de preço prontas pra exibir ("caixa 24 un R$ 80,00", "10+ caixas −5% …", "⚡ urgência …"). */
export function linhasDePreco(
  p: PrecoProduto & { aceita_urgencia?: boolean | null; taxa_urgencia?: number | null }
): string[] {
  const linhas: string[] = [];
  const opcoes = opcoesDePedido(p);
  for (const op of opcoes) {
    const rot = rotuloUnidade(op.codigo, 1);
    const extra = op.codigo === "caixa" && p.caixa_qtd ? ` ${p.caixa_qtd} un` : "";
    linhas.push(`${rot}${extra} ${reais(op.preco)}${!op.principal && p.permite_unidade ? " (avulso)" : ""}`);
  }
  const principal = opcoes.find((o) => o.principal);
  if (principal && p.desconto_qtd_min) {
    const plural = rotuloUnidade(principal.codigo, 2);
    if (p.desconto_pct) {
      linhas.push(
        `${p.desconto_qtd_min}+ ${plural}: ${p.desconto_pct.toLocaleString("pt-BR")}% de desconto (${reais(
          precoDaOpcao(p, principal, p.desconto_qtd_min)
        )}/${rotuloUnidade(principal.codigo, 1)})`
      );
    } else if (p.preco_desconto != null) {
      linhas.push(`${p.desconto_qtd_min}+ un ${reais(p.preco_desconto)}`);
    }
  }
  if (p.aceita_urgencia) {
    linhas.push(
      p.taxa_urgencia ? `⚡ aceita urgência (+${reais(p.taxa_urgencia)})` : "⚡ aceita urgência"
    );
  }
  return linhas;
}
