import { NextResponse } from "next/server";
import { listarPedidosDoFornecedor } from "@/lib/db";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/fornecedor/pedidos?situacao= -> pedidos recebidos, mais novo primeiro. */
export async function GET(request: Request) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const situacao = new URL(request.url).searchParams.get("situacao") || undefined;
    return NextResponse.json({ itens: await listarPedidosDoFornecedor(fornecedorId, situacao) });
  } catch (e) {
    console.error("Falha ao listar pedidos do fornecedor:", e);
    return NextResponse.json({ erro: "Não foi possível carregar." }, { status: 500 });
  }
}
