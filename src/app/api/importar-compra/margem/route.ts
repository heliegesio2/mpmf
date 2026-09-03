import { NextResponse } from "next/server";
import { definirMargemPadraoEmpresa, margemPadraoEmpresa } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/importar-compra/margem -> { margem } (% de lucro sobre a compra). */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  try {
    return NextResponse.json({ margem: await margemPadraoEmpresa(empresaId) });
  } catch (e) {
    console.error("Falha ao ler a margem:", e);
    return NextResponse.json({ erro: "Não foi possível carregar." }, { status: 500 });
  }
}

/** PUT /api/importar-compra/margem { margem } -> salva e devolve o valor aplicado. */
export async function PUT(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  try {
    const { margem } = (await request.json()) as { margem?: unknown };
    const n = Number(margem);
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      return NextResponse.json({ erro: "Percentual inválido." }, { status: 400 });
    }
    return NextResponse.json({ margem: await definirMargemPadraoEmpresa(empresaId, n) });
  } catch (e) {
    console.error("Falha ao salvar a margem:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
