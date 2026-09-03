import { NextResponse } from "next/server";
import { editarAnotacao, excluirAnotacao } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** PATCH /api/anotacoes/:id { concluida?, texto?, dataAlerta? } */
export async function PATCH(request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Anotação inválida." }, { status: 400 });
  }

  try {
    const c = await request.json().catch(() => ({}));
    const campos: { concluida?: boolean; texto?: string; dataAlerta?: string | null } = {};
    if (typeof c.concluida === "boolean") campos.concluida = c.concluida;
    if (typeof c.texto === "string" && c.texto.trim().length >= 2) campos.texto = c.texto.trim().slice(0, 2000);
    if ("dataAlerta" in c) {
      campos.dataAlerta = typeof c.dataAlerta === "string" && DIA.test(c.dataAlerta) ? c.dataAlerta : null;
    }

    const item = await editarAnotacao(empresaId, id, campos);
    if (!item) return NextResponse.json({ erro: "Nada pra mudar." }, { status: 400 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao editar anotação:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}

/** DELETE /api/anotacoes/:id */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Anotação inválida." }, { status: 400 });
  }

  try {
    const ok = await excluirAnotacao(empresaId, id);
    if (!ok) return NextResponse.json({ erro: "Anotação não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao excluir anotação:", e);
    return NextResponse.json({ erro: "Não foi possível excluir." }, { status: 500 });
  }
}
