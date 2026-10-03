/** Chamadas do navegador do levantamento de passivos (foto e vídeo). */

import { moedaParaNumero } from "./moeda";

export type LinhaPassivo = {
  incluir: boolean;
  nome: string;
  categoria: string;
  quantidade: string;
  descricao: string;
  /** moeda "1.234,56" (pt-BR) ou "" */
  valor: string;
  /** data URL da imagem em que o bem aparece melhor */
  foto: string;
};

/** Manda as imagens pra IA e devolve as linhas a conferir (foto = a imagem em que o bem aparece melhor). */
export async function analisarImagens(imagens: string[]): Promise<LinhaPassivo[]> {
  const r = await fetch("/api/passivos/analisar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imagens }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível analisar.");
  return (d.itens as { nome: string; categoria: string; quantidade: number; descricao: string; imagemIndice: number }[]).map(
    (it) => ({
      incluir: true,
      nome: it.nome,
      categoria: it.categoria,
      quantidade: String(it.quantidade),
      descricao: it.descricao,
      valor: "",
      foto: imagens[it.imagemIndice - 1] ?? "",
    })
  );
}

/** Grava as linhas marcadas. Devolve quantos bens foram salvos. */
export async function salvarLinhas(linhas: LinhaPassivo[], origem: "foto" | "video"): Promise<number> {
  const marcadas = linhas.filter((l) => l.incluir && l.nome.trim().length >= 2);
  if (marcadas.length === 0) throw new Error("Marque ao menos um bem com nome.");
  const r = await fetch("/api/passivos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itens: marcadas.map((l) => ({
        nome: l.nome,
        categoria: l.categoria,
        quantidade: Number(l.quantidade) || 1,
        descricao: l.descricao,
        valorEstimado: l.valor.trim() ? moedaParaNumero(l.valor) : null,
        foto: l.foto || undefined,
        origem,
      })),
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
  return marcadas.length;
}
