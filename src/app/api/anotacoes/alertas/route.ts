import { NextResponse } from "next/server";
import { anotacoesEmAlerta } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/anotacoes/alertas -> { total } de anotações abertas no dia do alerta (ou atrasadas). */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return NextResponse.json({ total: 0 });

  try {
    return NextResponse.json({ total: await anotacoesEmAlerta(empresaId) });
  } catch {
    return NextResponse.json({ total: 0 });
  }
}
