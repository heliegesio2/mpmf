/**
 * Logo enviada no cadastro público (empresa ou fornecedor): data URL de imagem,
 * já reduzida no navegador. Aqui só confere o formato e o tamanho; devolve
 * `null` se não veio nada, `undefined` se veio inválida/grande demais.
 */
const LIMITE_LOGO = 1_500_000; // caracteres do data URL (~1,1 MB de imagem)

export function lerLogoCadastro(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !v.startsWith("data:image/") || v.length > LIMITE_LOGO) return undefined;
  return v;
}
