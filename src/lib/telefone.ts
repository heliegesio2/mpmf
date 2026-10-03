/**
 * Máscara de telefone brasileiro: "(31) 98415-2772" (celular, 11 dígitos) ou
 * "(31) 3333-4444" (fixo, 10). Aceita o que vier (só dígitos, com +55, já
 * formatado) e vai montando a máscara conforme se digita.
 */
export function formatarTelefone(valor: string | null | undefined): string {
  let d = String(valor ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2); // tira o +55
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone com DDD: 10 (fixo) ou 11 (celular) dígitos. */
export function telefoneCompleto(valor: string | null | undefined): boolean {
  const n = formatarTelefone(valor).replace(/\D/g, "").length; // já descarta o +55
  return n === 10 || n === 11;
}
