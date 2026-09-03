import { NextResponse } from "next/server";
import { mudarStatusPedido, notificar, pedidoDetalhe } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/pedidos/:id -> detalhe (escopo da loja). */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

  const item = await pedidoDetalhe(id, { empresaId });
  if (!item) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  return NextResponse.json({ item });
}

/** PATCH /api/pedidos/:id { acao: "cancelar", motivo? } -> a loja cancela (só se novo). */
export async function PATCH(request: Request, { params }: Ctx) {
  const { empresaId, sessao, erro } = await exigirEmpresa();
  if (erro) return erro;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

  try {
    const { motivo } = (await request.json()) as { acao?: string; motivo?: string };
    const r = await mudarStatusPedido(id, { empresaId }, "cancelar", motivo);
    if ("erro" in r) {
      return NextResponse.json(
        {
          erro:
            r.erro === "nao-encontrado"
              ? "Pedido não encontrado."
              : "Esse pedido não pode mais ser cancelado.",
        },
        { status: r.erro === "nao-encontrado" ? 404 : 400 }
      );
    }
    await notificar(
      { fornecedorId: r.fornecedorId },
      {
        tipo: "pedido",
        titulo: `${sessao.empresaNome ?? "A loja"} cancelou o pedido`,
        link: "/fornecedor/pedidos",
        chave: `pedido:${id}:cancelado`,
      }
    );
    return NextResponse.json({ item: r.pedido });
  } catch (e) {
    console.error("Falha ao cancelar pedido:", e);
    return NextResponse.json({ erro: "Não foi possível cancelar." }, { status: 500 });
  }
}
