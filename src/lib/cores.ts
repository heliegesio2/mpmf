/**
 * Cores preferenciais da empresa/fornecedor: lista de "#rrggbb" (minúsculo,
 * sem repetição, no máximo `MAX_CORES`). Puro — usado pelas rotas e pelas telas.
 */
export const MAX_CORES = 8;

export function lerCores(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const c of v) {
    const t = String(c ?? "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(t) && !out.includes(t)) out.push(t);
    if (out.length >= MAX_CORES) break;
  }
  return out;
}
