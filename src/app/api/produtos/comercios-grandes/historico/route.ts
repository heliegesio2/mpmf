import { NextResponse } from "next/server";
import { listarEstabelecimentosCotados } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/produtos/comercios-grandes/historico -> grid: um card por estabelecimento já analisado. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  try {
    const itens = await listarEstabelecimentosCotados(empresaId);
    return NextResponse.json({ itens });
  } catch (e) {
    console.error("Falha ao listar o histórico de cotações:", e);
    return NextResponse.json({ erro: "Não foi possível carregar." }, { status: 500 });
  }
}
