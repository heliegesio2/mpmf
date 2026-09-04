import { NextResponse } from "next/server";
import { listarLotesDoEstabelecimento } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/produtos/comercios-grandes/lotes?estabelecimento=X -> histórico de lançamentos desse concorrente. */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  const estabelecimento = new URL(request.url).searchParams.get("estabelecimento") ?? "";
  if (estabelecimento.trim().length < 2) {
    return NextResponse.json({ erro: "Informe o estabelecimento." }, { status: 400 });
  }
  try {
    const itens = await listarLotesDoEstabelecimento(empresaId, estabelecimento);
    return NextResponse.json({ itens });
  } catch (e) {
    console.error("Falha ao listar os lançamentos:", e);
    return NextResponse.json({ erro: "Não foi possível carregar." }, { status: 500 });
  }
}
