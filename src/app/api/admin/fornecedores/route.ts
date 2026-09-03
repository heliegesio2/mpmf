import { NextResponse } from "next/server";
import { listarFornecedoresPublicos } from "@/lib/db";
import { exigirSuperAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/admin/fornecedores?situacao=pendente|aprovado|reprovado|todas&q= -> só super admin. */
export async function GET(request: Request) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const url = new URL(request.url);
  const situacao = url.searchParams.get("situacao") ?? "todas";
  const q = url.searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ itens: await listarFornecedoresPublicos(situacao, q) });
  } catch (e) {
    console.error("Falha ao listar fornecedores públicos:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível listar.", detalhe }, { status: 500 });
  }
}
