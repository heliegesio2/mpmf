import { NextResponse } from "next/server";
import { reputacaoPorCpf } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * GET /api/clientes/reputacao?cpf=... -> nota media do CPF cruzando TODAS as
 * empresas (reputacao compartilhada). So numeros agregados, sem nenhum dado
 * pessoal. Precisa estar logado numa empresa.
 */
export async function GET(request: Request) {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  const cpf = new URL(request.url).searchParams.get("cpf") ?? "";
  try {
    return NextResponse.json(await reputacaoPorCpf(cpf));
  } catch (e) {
    console.error("Falha ao consultar reputação:", e);
    return NextResponse.json({ media: null, avaliacoes: 0, cadastros: 0 });
  }
}
