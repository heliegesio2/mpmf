import { NextResponse } from "next/server";
import { portfolioPublico } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** GET /api/pedidos/catalogo/:slug -> catálogo do fornecedor pra montar o pedido. */
export async function GET(_request: Request, { params }: Ctx) {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  const { slug } = await params;
  const dados = await portfolioPublico(slug);
  if (!dados) return NextResponse.json({ erro: "Fornecedor não encontrado." }, { status: 404 });

  return NextResponse.json({
    fornecedor: {
      id: dados.fornecedor.id,
      nome: dados.fornecedor.nome,
      cidade: dados.fornecedor.cidade,
      observacao: dados.fornecedor.observacao,
      slug: dados.fornecedor.slug,
    },
    produtos: dados.produtos,
  });
}
