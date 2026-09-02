/** Constantes e helpers de contas a pagar compartilhados entre as telas (client-safe). */

export const CATEGORIAS_PADRAO: { valor: string; rotulo: string }[] = [
  { valor: "mercadoria", rotulo: "Mercadoria" },
  { valor: "energia", rotulo: "Luz" },
  { valor: "agua", rotulo: "Água" },
  { valor: "aluguel", rotulo: "Aluguel" },
  { valor: "telefone", rotulo: "Telefone / Internet" },
  { valor: "imposto", rotulo: "Impostos e taxas" },
  { valor: "salario", rotulo: "Salários" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "outros", rotulo: "Outros" },
];

export const ROTULO_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS_PADRAO.map((c) => [c.valor, c.rotulo])
);

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "vencida há 3 dias", "vence hoje", "vence em 5 dias" — null quando não há vencimento. */
export function prazoVencimento(venc: string | null): { texto: string; atrasada: boolean } | null {
  if (!venc) return null;
  const dias = Math.round(
    (Date.parse(venc + "T00:00:00") - Date.parse(hojeISO() + "T00:00:00")) / 86400000
  );
  if (dias < 0) return { texto: `vencida há ${-dias} dia${dias === -1 ? "" : "s"}`, atrasada: true };
  if (dias === 0) return { texto: "vence hoje", atrasada: true };
  if (dias === 1) return { texto: "vence amanhã", atrasada: false };
  return { texto: `vence em ${dias} dias`, atrasada: false };
}
