import { NextResponse } from "next/server";
import { atualizarFornecedor, excluirFornecedor, fornecedorPorId } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function limpar(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t || null;
}

/** GET /api/fornecedores/:id */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Fornecedor inválido." }, { status: 400 });

  const item = await fornecedorPorId(empresaId, id);
  if (!item) return NextResponse.json({ erro: "Fornecedor não encontrado." }, { status: 404 });
  return NextResponse.json({ item });
}

/** PUT /api/fornecedores/:id */
export async function PUT(request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Fornecedor inválido." }, { status: 400 });

  try {
    const c = await request.json();
    const nome = String(c.nome ?? "").trim();
    if (nome.length < 2) {
      return NextResponse.json({ erro: "Informe o nome do fornecedor." }, { status: 400 });
    }
    const item = await atualizarFornecedor(empresaId, id, {
      nome,
      documento: limpar(c.documento),
      telefone: limpar(c.telefone),
      telefoneWhatsapp: Boolean(c.telefoneWhatsapp),
      endereco: limpar(c.endereco),
      observacao: limpar(c.observacao),
      pixChave: limpar(c.pixChave),
    });
    if (!item) return NextResponse.json({ erro: "Fornecedor não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao salvar fornecedor:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}

/** DELETE /api/fornecedores/:id */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Fornecedor inválido." }, { status: 400 });

  const ok = await excluirFornecedor(empresaId, id);
  if (!ok) return NextResponse.json({ erro: "Fornecedor não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
