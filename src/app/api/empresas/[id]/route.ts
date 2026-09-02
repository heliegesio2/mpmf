import { NextResponse } from "next/server";
import { decidirEmpresa, editarEmpresa } from "@/lib/db";
import { exigirSuperAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** PUT /api/empresas/:id  { situacao: "aprovada" | "reprovada", motivo? } */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Empresa inválida." }, { status: 400 });
  }

  try {
    const { situacao, motivo } = await request.json();
    if (situacao !== "aprovada" && situacao !== "reprovada") {
      return NextResponse.json({ erro: "Situação inválida." }, { status: 400 });
    }
    if (situacao === "reprovada" && !String(motivo ?? "").trim()) {
      return NextResponse.json({ erro: "Informe o motivo da reprovação." }, { status: 400 });
    }

    const item = await decidirEmpresa(id, situacao, motivo);
    if (!item) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao decidir empresa:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}

/** PATCH /api/empresas/:id  { nome, documento, telefone?, cidade? } -> edita os dados cadastrais. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Empresa inválida." }, { status: 400 });
  }

  try {
    const c = await request.json();
    const nome = String(c.nome ?? "").trim();
    const documento = String(c.documento ?? "").replace(/\D/g, "");

    if (nome.length < 2) {
      return NextResponse.json({ erro: "Informe o nome da empresa." }, { status: 400 });
    }
    if (documento.length !== 11 && documento.length !== 14) {
      return NextResponse.json({ erro: "CNPJ ou CPF inválido." }, { status: 400 });
    }

    const item = await editarEmpresa(id, {
      nome,
      documento,
      telefone: c.telefone ?? null,
      telefoneWhatsapp: Boolean(c.telefoneWhatsapp),
      cidade: c.cidade ?? null,
    });
    if (!item) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

    return NextResponse.json({ item });
  } catch (e: any) {
    if (e?.code === "23505") {
      return NextResponse.json({ erro: "Já existe empresa com esse documento." }, { status: 409 });
    }
    console.error("Falha ao editar empresa:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
