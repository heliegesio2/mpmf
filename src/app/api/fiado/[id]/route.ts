import { NextResponse } from "next/server";
import { marcarFiadoPago } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/fiado/:id -> marca esse lançamento como pago. */
export async function PATCH(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Lançamento inválido." }, { status: 400 });
  }

  try {
    const ok = await marcarFiadoPago(empresaId, id);
    if (!ok) return NextResponse.json({ erro: "Lançamento não encontrado ou já pago." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao quitar fiado:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
