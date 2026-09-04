import { NextResponse } from "next/server";
import { listarNotasCompra } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/importar-compra/notas -> últimas notas de compra confirmadas. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  try {
    const itens = await listarNotasCompra(empresaId);
    return NextResponse.json({ itens });
  } catch (e) {
    console.error("Falha ao listar notas de compra:", e);
    return NextResponse.json({ erro: "Não foi possível listar." }, { status: 500 });
  }
}
