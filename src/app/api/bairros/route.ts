import { NextResponse } from "next/server";
import { cidadesComBairro, listarBairros } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/bairros?cidade=Conselheiro Lafaiete -> [{ id, nome }]
 * Público (usado no cadastro de fornecedor). Sem `cidade`, devolve as cidades
 * que já têm bairros cadastrados.
 */
export async function GET(request: Request) {
  const cidade = new URL(request.url).searchParams.get("cidade")?.trim();
  try {
    if (!cidade) {
      return NextResponse.json({ cidades: await cidadesComBairro() });
    }
    return NextResponse.json({ cidade, itens: await listarBairros(cidade) });
  } catch (e) {
    console.error("Falha ao listar bairros:", e);
    return NextResponse.json({ erro: "Não foi possível carregar os bairros." }, { status: 500 });
  }
}
