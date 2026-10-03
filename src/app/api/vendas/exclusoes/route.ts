import { NextResponse } from "next/server";
import { listarExclusoesVenda } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/vendas/exclusoes -> log de vendas excluídas (quem, quando, o que tinha). */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    return NextResponse.json({ itens: await listarExclusoesVenda(empresaId) });
  } catch (e) {
    console.error("Falha ao listar exclusões de venda:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível carregar o log.", detalhe }, { status: 500 });
  }
}
