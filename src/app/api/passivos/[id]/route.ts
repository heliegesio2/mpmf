import { NextResponse } from "next/server";
import { atualizarPassivo, excluirPassivo } from "@/lib/db";
import { lerEntradaPassivo } from "@/lib/passivo";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/passivos/:id — edita um bem (foto: ausente mantém, "" remove, data URL troca). */
export async function PUT(request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Bem inválido." }, { status: 400 });

  try {
    const e = lerEntradaPassivo((await request.json()) as Record<string, unknown>);
    if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: 400 });
    const item = await atualizarPassivo(empresaId, id, e);
    if (!item) return NextResponse.json({ erro: "Bem não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao atualizar passivo:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}

/** DELETE /api/passivos/:id */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Bem inválido." }, { status: 400 });

  try {
    const ok = await excluirPassivo(empresaId, id);
    if (!ok) return NextResponse.json({ erro: "Bem não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao excluir passivo:", e);
    return NextResponse.json({ erro: "Não foi possível excluir." }, { status: 500 });
  }
}
