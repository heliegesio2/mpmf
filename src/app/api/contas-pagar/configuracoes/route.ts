import { NextResponse } from "next/server";
import { avisoDiasContasPagar, definirAvisoDiasContasPagar } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/contas-pagar/configuracoes -> { avisoDias } */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    return NextResponse.json({ avisoDias: await avisoDiasContasPagar(empresaId) });
  } catch (e) {
    console.error("Falha ao carregar configurações de contas a pagar:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível carregar.", detalhe }, { status: 500 });
  }
}

/** PUT /api/contas-pagar/configuracoes { avisoDias } */
export async function PUT(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = await request.json();
    const dias = Number(c.avisoDias);
    if (!Number.isInteger(dias) || dias < 0 || dias > 90) {
      return NextResponse.json({ erro: "Informe um número de dias entre 0 e 90." }, { status: 400 });
    }
    return NextResponse.json({ avisoDias: await definirAvisoDiasContasPagar(empresaId, dias) });
  } catch (e) {
    console.error("Falha ao salvar configurações de contas a pagar:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
