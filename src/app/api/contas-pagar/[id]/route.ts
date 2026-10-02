import { NextResponse } from "next/server";
import {
  marcarContaPagarPaga,
  reabrirContaPagar,
  excluirContaPagar,
  atualizarValorContaPagar,
} from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/contas-pagar/:id
 *   { valor } -> so atualiza o valor (conta recorrente de valor variavel)
 *   { acao: "pagar" | "reabrir" } -> quita ou reabre (default "pagar")
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Conta inválida." }, { status: 400 });

  let acao = "pagar";
  let novoValor: number | null = null;
  try {
    const c = await request.json();
    if (c?.acao === "reabrir") acao = "reabrir";
    if (c?.valor != null) {
      const v = Number(c.valor);
      if (!Number.isFinite(v) || v <= 0) {
        return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
      }
      novoValor = Math.round(v * 100) / 100;
    }
  } catch {
    /* corpo vazio = pagar */
  }

  if (novoValor !== null) {
    const atualizada = await atualizarValorContaPagar(empresaId, id, novoValor);
    if (!atualizada) {
      return NextResponse.json({ erro: "Conta não encontrada ou já paga." }, { status: 404 });
    }
    return NextResponse.json({ item: atualizada });
  }

  if (acao === "reabrir") {
    const ok = await reabrirContaPagar(empresaId, id);
    if (!ok) return NextResponse.json({ erro: "Conta não encontrada ou já nesse estado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const r = await marcarContaPagarPaga(empresaId, id);
  if (!r.ok) return NextResponse.json({ erro: "Conta não encontrada ou já nesse estado." }, { status: 404 });
  return NextResponse.json({ ok: true, parcelasGeradas: r.parcelasGeradas });
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
