import { NextResponse } from "next/server";
import { criarPedido, listarPedidosDaLoja, notificar } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const reais = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** GET /api/pedidos -> pedidos da loja, mais novo primeiro. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  try {
    return NextResponse.json({ itens: await listarPedidosDaLoja(empresaId) });
  } catch (e) {
    console.error("Falha ao listar pedidos da loja:", e);
    return NextResponse.json({ erro: "Não foi possível carregar." }, { status: 500 });
  }
}

/** POST /api/pedidos { fornecedorPublicoId, observacao, itens } -> cria + avisa o fornecedor. */
export async function POST(request: Request) {
  const { empresaId, sessao, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = (await request.json()) as {
      fornecedorPublicoId?: number;
      observacao?: string;
      itens?: { fornecedorProdutoId: number; unidade: "un" | "caixa"; qtd: number }[];
    };
    const fornecedorPublicoId = Number(c.fornecedorPublicoId);
    if (!Number.isInteger(fornecedorPublicoId) || !Array.isArray(c.itens) || c.itens.length === 0) {
      return NextResponse.json({ erro: "Pedido incompleto." }, { status: 400 });
    }

    const r = await criarPedido(empresaId, sessao.usuarioId, fornecedorPublicoId, {
      observacao: c.observacao,
      itens: c.itens,
    });

    await notificar(
      { fornecedorId: fornecedorPublicoId },
      {
        tipo: "pedido",
        titulo: `Novo pedido de ${sessao.empresaNome ?? "uma loja"}`,
        corpo: `${r.nItens} ${r.nItens === 1 ? "item" : "itens"} · ${reais(r.total)}`,
        link: "/fornecedor/pedidos",
        chave: `pedido:${r.id}:novo`,
      }
    );

    return NextResponse.json({ id: r.id, total: r.total }, { status: 201 });
  } catch (e) {
    const cod = (e as { code?: string }).code;
    if (cod === "SEM_ITEM" || cod === "FORN_INDISP") {
      return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
    }
    console.error("Falha ao criar pedido:", e);
    return NextResponse.json({ erro: "Não foi possível enviar o pedido." }, { status: 500 });
  }
}
