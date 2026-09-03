import { NextResponse } from "next/server";
import {
  categoriasFornecedorUsadas,
  criarProdutoFornecedor,
  listarProdutosFornecedor,
} from "@/lib/db";
import { lerEntradaProduto } from "@/lib/fornecedorProduto";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/fornecedor/produtos -> { itens, categorias } */
export async function GET() {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const [itens, categorias] = await Promise.all([
      listarProdutosFornecedor(fornecedorId),
      categoriasFornecedorUsadas(fornecedorId),
    ]);
    return NextResponse.json({ itens, categorias });
  } catch (e) {
    console.error("Falha ao listar produtos do fornecedor:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível carregar.", detalhe }, { status: 500 });
  }
}

/** POST /api/fornecedor/produtos -> cria um produto */
export async function POST(request: Request) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const dados = lerEntradaProduto((await request.json()) as Record<string, unknown>);
    if ("erro" in dados) return NextResponse.json({ erro: dados.erro }, { status: 400 });

    const item = await criarProdutoFornecedor(fornecedorId, dados);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Falha ao criar produto do fornecedor:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
