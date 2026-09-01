import { NextResponse } from "next/server";
import { quitarFiadoDoCliente } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** POST /api/fiado/quitar { clienteId } -> marca todo o fiado em aberto do cliente como pago. */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const clienteId = Number((await request.json()).clienteId);
    if (!Number.isInteger(clienteId)) {
      return NextResponse.json({ erro: "Cliente inválido." }, { status: 400 });
    }
    const quitados = await quitarFiadoDoCliente(empresaId, clienteId);
    return NextResponse.json({ quitados });
  } catch (e) {
    console.error("Falha ao quitar cliente:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
