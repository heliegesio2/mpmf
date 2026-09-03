import { NextResponse } from "next/server";
import { decidirFornecedorPublico } from "@/lib/db";
import { exigirSuperAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** PUT /api/admin/fornecedores/:id  { situacao: "aprovado" | "reprovado", motivo? } */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Fornecedor inválido." }, { status: 400 });
  }

  try {
    const { situacao, motivo } = await request.json();
    if (situacao !== "aprovado" && situacao !== "reprovado") {
      return NextResponse.json({ erro: "Situação inválida." }, { status: 400 });
    }
    if (situacao === "reprovado" && !String(motivo ?? "").trim()) {
      return NextResponse.json({ erro: "Informe o motivo da reprovação." }, { status: 400 });
    }

    const item = await decidirFornecedorPublico(id, situacao, motivo);
    if (!item) return NextResponse.json({ erro: "Fornecedor não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao decidir fornecedor público:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
