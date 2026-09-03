import { NextResponse } from "next/server";
import { listarVendas } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/vendas?de=YYYY-MM-DD&ate=YYYY-MM-DD -> vendas do período (padrão: hoje). */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const url = new URL(request.url);
  const hoje = new Date().toLocaleDateString("en-CA");
  const de = url.searchParams.get("de") || hoje;
  const ate = url.searchParams.get("ate") || hoje;

  if (!DIA.test(de) || !DIA.test(ate)) {
    return NextResponse.json({ erro: "Datas inválidas." }, { status: 400 });
  }

  const [inicio, fim] = de <= ate ? [de, ate] : [ate, de];

  try {
    return NextResponse.json({ de: inicio, ate: fim, itens: await listarVendas(empresaId, inicio, fim) });
  } catch (e) {
    console.error("Falha ao listar vendas:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível listar as vendas.", detalhe }, { status: 500 });
  }
}
