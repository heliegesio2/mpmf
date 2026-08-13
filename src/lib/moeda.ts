/**
 * Máscara de moeda no padrão de PDV: o caixa digita só os dígitos e eles
 * entram pela direita. Teclar 4, 5, 0 vira "4,50" — sem precisar da vírgula.
 */

const formatador = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Centavos (inteiro) -> "1.234,50" */
export function formatarMoeda(centavos: number): string {
  return formatador.format(centavos / 100);
}

/**
 * Aplica a máscara ao que foi digitado. Considera só os dígitos, então
 * apagar com Backspace anda casa a casa naturalmente.
 */
export function mascararMoeda(texto: string): string {
  const digitos = texto.replace(/\D/g, "").slice(0, 11); // teto de R$ 999.999.999,99
  if (!digitos) return "";
  return formatarMoeda(Number(digitos));
}

/**
 * Normaliza um valor que veio de fora do teclado — da voz ou do banco —
 * para o formato exibido.
 *   "4,50"  -> "4,50"      (já é decimal)
 *   "4.5"   -> "4,50"
 *   "150"   -> "150,00"    (voz: "cento e cinquenta" são reais, não centavos)
 */
export function paraMoeda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";

  const texto = String(valor).trim();

  // Com vírgula, o ponto é separador de milhar ("1.234,50").
  // Sem vírgula, um ponto só pode ser decimal — é o formato que o banco devolve.
  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;

  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return "";
  return formatarMoeda(Math.round(numero * 100));
}

/** "1.234,50" -> 1234.5 — usado antes de mandar para o banco. */
export function moedaParaNumero(texto: string): number {
  const limpo = String(texto ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}
