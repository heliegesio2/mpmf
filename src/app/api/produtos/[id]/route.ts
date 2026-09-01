import { NextResponse } from "next/server";
import { atualizarProduto, excluirProduto, produtoPorId } from "@/lib/db";
import { validar } from "@/lib/validacao";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/produtos/:id -> um produto (tela de edição). */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  const item = await produtoPorId(empresaId, id);
  if (!item) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
  return NextResponse.json({ item });
}

/** PUT /api/produtos/:id -> altera nome, preco, quantidade etc. */
export async function PUT(request: Request, { params }: Ctx) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const corpo = await request.json();
    const { dados, erro } = validar(corpo);
    if (erro) return NextResponse.json({ erro }, { status: 400 });

    const item = await atualizarProduto(empresaId, id, dados!);
    if (!item) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });

    return NextResponse.json({ item });
  } catch (erro) {
    console.error("Falha ao alterar produto:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json(
      { erro: "Não foi possível salvar a alteração.", detalhe },
      { status: 500 }
    );
  }
}

/** DELETE /api/produtos/:id -> exclui */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const removeu = await excluirProduto(empresaId, id);
    if (!removeu) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    console.error("Falha ao excluir produto:", erro);
    return NextResponse.json({ erro: "Não foi possível excluir o produto." }, { status: 500 });
  }
}
