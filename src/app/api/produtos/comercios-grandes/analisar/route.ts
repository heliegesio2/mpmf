import { NextResponse } from "next/server";
import { compararCotacoes, normalizarNomeProduto, registrarCotacoes } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Entrada = {
  estabelecimento?: string;
  fonte?: string;
  itens?: { nome?: string; preco?: number | null }[];
};

/**
 * POST /api/produtos/comercios-grandes/analisar
 * { estabelecimento, fonte, itens: [{ nome, preco }] }
 *
 * Fica só com os itens que tiveram preço lido, compara com o meu catálogo e
 * com a última cotação do mesmo estabelecimento, grava a leitura do dia e
 * devolve o resumo + a lista comparada.
 */
export async function POST(request: Request) {
  const { empresaId, sessao, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const corpo = (await request.json()) as Entrada;
    const estabelecimento = String(corpo.estabelecimento ?? "").trim();
    if (estabelecimento.length < 2) {
      return NextResponse.json({ erro: "Informe o nome do estabelecimento." }, { status: 400 });
    }
    const fonte = String(corpo.fonte ?? "foto");
    const brutos = Array.isArray(corpo.itens) ? corpo.itens : [];

    // dedup por nome normalizado, guardando o primeiro com preço
    const mapa = new Map<string, { nome: string; preco: number | null }>();
    for (const it of brutos) {
      const nome = String(it?.nome ?? "").trim();
      if (nome.length < 2) continue;
      const chave = normalizarNomeProduto(nome);
      if (!chave) continue;
      const preco =
        typeof it?.preco === "number" && Number.isFinite(it.preco) && it.preco > 0
          ? Math.round(it.preco * 100) / 100
          : null;
      const atual = mapa.get(chave);
      if (!atual) mapa.set(chave, { nome, preco });
      else if (atual.preco === null && preco !== null) mapa.set(chave, { nome, preco });
    }

    const todos = [...mapa.values()];
    const comPreco = todos.filter((t): t is { nome: string; preco: number } => t.preco !== null);

    const comparados = await compararCotacoes(empresaId, estabelecimento, comPreco);
    let loteId: number | null = null;
    if (comparados.length > 0) {
      const registrado = await registrarCotacoes(empresaId, estabelecimento, fonte, comparados, {
        usuarioId: sessao.usuarioId || null,
        usuarioNome: sessao.nome,
      });
      loteId = registrado.loteId;
    }

    // mais barato lá primeiro (mais relevante), depois os sem match
    const rank = (r: (typeof comparados)[number]) =>
      r.meuPreco !== null ? r.preco - r.meuPreco : 1e9;
    comparados.sort((a, b) => rank(a) - rank(b));

    return NextResponse.json({
      estabelecimento,
      registradoEm: new Date().toISOString().slice(0, 10),
      resumo: { total: todos.length, comPreco: comparados.length },
      itens: comparados,
      loteId,
    });
  } catch (e) {
    console.error("Falha ao analisar a cotação:", e);
    return NextResponse.json({ erro: "Não foi possível analisar." }, { status: 500 });
  }
}
