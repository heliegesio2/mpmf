import { NextResponse } from "next/server";
import { atualizarProdutoFornecedor, excluirProdutoFornecedor } from "@/lib/db";
import { lerEntradaProduto } from "@/lib/fornecedorProduto";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/fornecedor/produtos/:id */
export async function PUT(request: Request, { params }: Ctx) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const dados = lerEntradaProduto((await request.json()) as Record<string, unknown>);
    if ("erro" in dados) return NextResponse.json({ erro: dados.erro }, { status: 400 });

    const item = await atualizarProdutoFornecedor(fornecedorId, id, dados);
    if (!item) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao atualizar produto do fornecedor:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}

/** DELETE /api/fornecedor/produtos/:id */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const ok = await excluirProdutoFornecedor(fornecedorId, id);
    if (!ok) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao excluir produto do fornecedor:", e);
    return NextResponse.json({ erro: "Não foi possível excluir." }, { status: 500 });
  }
}
