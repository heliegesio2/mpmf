/**
 * Helpers puros de pedido (sem `pg`, sem DOM) — usados pelas rotas de API e
 * pelas telas.
 */

import { opcoesDePedido, precoDaOpcao, rotuloUnidade, type PrecoProduto } from "./fornecedorProduto";

/** "un" | "caixa" | "quilo" | … — o código do tipo de venda (ver `TIPOS_VENDA`). */
export type UnidadePedido = string;
export type StatusPedido = "novo" | "visto" | "atendido" | "cancelado";

/**
 * Preço unitário aplicável dada a unidade e a quantidade pedida (já com o
 * desconto por quantidade). `null` = o produto não é vendido assim.
 */
export function precoAplicavel(
  p: PrecoProduto,
  unidade: UnidadePedido,
  qtd: number
): number | null {
  const op = opcoesDePedido(p).find((o) => o.codigo === unidade);
  return op ? precoDaOpcao(p, op, qtd) : null;
}

export const STATUS_PEDIDO: Record<StatusPedido, { rotulo: string; sinal: string }> = {
  novo: { rotulo: "novo", sinal: "novo" },
  visto: { rotulo: "visto", sinal: "visto" },
  atendido: { rotulo: "atendido", sinal: "ok" },
  cancelado: { rotulo: "cancelado", sinal: "cancelado" },
};

/**
 * O status resultante de uma ação, ou `null` se a transição não é permitida.
 * `quem`: "fornecedor" | "loja".
 */
export function proximoStatusValido(
  atual: StatusPedido,
  acao: "visto" | "atender" | "cancelar",
  quem: "fornecedor" | "loja"
): StatusPedido | null {
  if (atual === "atendido" || atual === "cancelado") return null;
  if (quem === "loja") {
    return acao === "cancelar" && atual === "novo" ? "cancelado" : null;
  }
  // fornecedor
  if (acao === "visto") return atual === "novo" ? "visto" : null;
  if (acao === "atender") return "atendido";
  if (acao === "cancelar") return "cancelado";
  return null;
}

/** "agora / há 20 min / hoje 14:32 / ontem / 3 set / 3 set 2024" (pt-BR, sem lib). */
export function quando(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  const min = Math.round((agora.getTime() - d.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;

  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dia(agora) - dia(d)) / 86400000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `hoje ${hora}`;
  if (diff === 1) return `ontem ${hora}`;
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== agora.getFullYear() ? { year: "numeric" } : {}),
  });
}

const reais = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "12 un" / "2 caixas" / "5 kg" */
export function qtdComUnidade(qtd: number, unidade: UnidadePedido): string {
  return `${qtd} ${rotuloUnidade(unidade, qtd)}`;
}

export { reais as reaisPedido };
