import { NextResponse } from "next/server";
import { buscarProduto, listarProdutos, criarProduto } from "@/lib/db";
import { validar } from "@/lib/validacao";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * GET /api/produtos?q=termo        -> busca ranqueada (tela de consulta)
 * GET /api/produtos?todos=1&q=...  -> lista completa (tela de edicao)
 */
export async function GET(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const params = new URL(request.url).searchParams;
  const termo = params.get("q")?.trim() ?? "";
  const todos = params.get("todos") === "1";

  try {
    if (todos) {
      return NextResponse.json({ termo, itens: await listarProdutos(empresaId, termo) });
    }
    if (termo.length < 2) {
      return NextResponse.json({ termo, itens: [] });
    }
    return NextResponse.json({ termo, itens: await buscarProduto(empresaId, termo, 8) });
  } catch (erro) {
    console.error("Falha na busca de produto:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json(
      { erro: "Não foi possível consultar o banco agora.", detalhe },
      { status: 500 }
    );
  }
}

/** POST /api/produtos -> inclui um produto */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  try {
    const corpo = await request.json();
    const { dados, erro } = validar(corpo);
    if (erro) return NextResponse.json({ erro }, { status: 400 });

    return NextResponse.json({ item: await criarProduto(empresaId, dados!) }, { status: 201 });
  } catch (erro) {
    console.error("Falha ao incluir produto:", erro);
    // detalhe do Postgres ajuda a diagnosticar (ex.: coluna/migração faltando)
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json(
      { erro: "Não foi possível salvar o produto.", detalhe },
      { status: 500 }
    );
  }
}
