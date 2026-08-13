import type { ProdutoEntrada } from "./db";
import { TIPOS_VENDA } from "./tipos";

const VALORES = TIPOS_VENDA.map((t) => t.valor as string);

/** Aceita "4,50" e "4.50" — o formulario usa virgula. */
function numero(v: unknown): number {
  return Number(String(v ?? "").trim().replace(",", "."));
}

/** Valida o corpo vindo do formulario antes de tocar no banco. */
export function validar(corpo: unknown): { dados?: ProdutoEntrada; erro?: string } {
  if (typeof corpo !== "object" || corpo === null) {
    return { erro: "Envie os dados do produto." };
  }

  const c = corpo as Record<string, unknown>;
  const nome = String(c.nome ?? "").trim();
  const preco = numero(c.preco);
  const precoCompra = numero(c.precoCompra ?? 0);
  const estoque = numero(c.estoque);
  const tipoVenda = String(c.tipoVenda ?? "unidade");

  if (nome.length < 2) return { erro: "O nome precisa ter ao menos 2 letras." };
  if (!Number.isFinite(preco) || preco < 0) return { erro: "Informe um preço de venda válido." };
  if (!Number.isFinite(precoCompra) || precoCompra < 0) {
    return { erro: "Informe um preço de compra válido." };
  }
  if (!Number.isFinite(estoque) || estoque < 0) return { erro: "Informe uma quantidade válida." };
  if (!VALORES.includes(tipoVenda)) return { erro: "Escolha unidade, quilo ou dúzia." };

  return {
    dados: {
      nome,
      categoria: c.categoria ? String(c.categoria).trim() : null,
      local: c.local ? String(c.local).trim() : null,
      unidade: String(c.unidade ?? "").trim() || "unidade",
      tipoVenda,
      preco,
      precoCompra,
      estoque,
    },
  };
}
