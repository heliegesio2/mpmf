import { NextResponse } from "next/server";
import { atualizarAtivoMercadoPago, desconectarMercadoPagoEmpresa, mercadoPagoDaEmpresa } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/mercadopago -> se a loja conectou, e se está usando pro Pix. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const mp = await mercadoPagoDaEmpresa(empresaId);
  return NextResponse.json({ conectado: Boolean(mp), ativo: mp?.ativo ?? false });
}

/** PATCH /api/mercadopago { ativo } -> escolhe Pix via Mercado Pago ou Pix direto. */
export async function PATCH(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const { ativo } = await request.json();
  await atualizarAtivoMercadoPago(empresaId, Boolean(ativo));
  return NextResponse.json({ ok: true });
}

/** DELETE /api/mercadopago -> desconecta a conta Mercado Pago da loja. */
export async function DELETE() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  await desconectarMercadoPagoEmpresa(empresaId);
  return NextResponse.json({ ok: true });
}
