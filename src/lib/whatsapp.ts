/** Link wa.me a partir de um telefone brasileiro digitado de qualquer jeito. */
export function linkWhatsapp(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const comPais = d.startsWith("55") && d.length >= 12 ? d : "55" + d;
  return `https://wa.me/${comPais}`;
}
