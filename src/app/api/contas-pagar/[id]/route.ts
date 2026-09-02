import { NextResponse } from "next/server";
import { marcarContaPagarPaga, reabrirContaPagar, excluirContaPagar } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/contas-pagar/:id { acao: "pagar" | "reabrir" } */
export async function PATCH(request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Conta inválida." }, { status: 400 });

  let acao = "pagar";
  try {
    const c = await request.json();
    if (c?.acao === "reabrir") acao = "reabrir";
  } catch {
    /* corpo vazio = pagar */
  }

  if (acao === "reabrir") {
    const ok = await reabrirContaPagar(empresaId, id);
    if (!ok) return NextResponse.json({ erro: "Conta não encontrada ou já nesse estado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const r = await marcarContaPagarPaga(empresaId, id);
  if (!r.ok) return NextResponse.json({ erro: "Conta não encontrada ou já nesse estado." }, { status: 404 });
  return NextResponse.json({ ok: true, proximaVencimento: r.proximaVencimento });
}

/** DELETE /api/contas-pagar/:id */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Conta inválida." }, { status: 400 });

  const ok = await excluirContaPagar(empresaId, id);
  if (!ok) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
