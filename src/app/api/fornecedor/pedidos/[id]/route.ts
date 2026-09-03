import { NextResponse } from "next/server";
import { mudarStatusPedido, notificarUsuariosDaEmpresa, pedidoDetalhe } from "@/lib/db";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/fornecedor/pedidos/:id -> detalhe (escopo do fornecedor). */
export async function GET(_request: Request, { params }: Ctx) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

  const item = await pedidoDetalhe(id, { fornecedorId });
  if (!item) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  return NextResponse.json({ item });
}

const ACOES = new Set(["visto", "atender", "cancelar"]);

/** PATCH /api/fornecedor/pedidos/:id { acao: "visto"|"atender"|"cancelar", motivo? } */
export async function PATCH(request: Request, { params }: Ctx) {
  const { fornecedorId, sessao, erro } = await exigirFornecedor();
  if (erro) return erro;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

  try {
    const { acao, motivo } = (await request.json()) as { acao?: string; motivo?: string };
    if (!acao || !ACOES.has(acao)) {
      return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    }

    const r = await mudarStatusPedido(
      id,
      { fornecedorId },
      acao as "visto" | "atender" | "cancelar",
      motivo
    );
    if ("erro" in r) {
      return NextResponse.json(
        {
          erro:
            r.erro === "nao-encontrado"
              ? "Pedido não encontrado."
              : "Essa mudança de status não é permitida agora.",
        },
        { status: r.erro === "nao-encontrado" ? 404 : 400 }
      );
    }

    if (r.pedido.status === "atendido" || r.pedido.status === "cancelado") {
      await notificarUsuariosDaEmpresa(
        r.empresaId,
        {
          tipo: "pedido",
          titulo: `Seu pedido foi ${r.pedido.status} por ${sessao.nome}`,
          corpo:
            r.pedido.status === "cancelado" && motivo?.trim()
              ? `Motivo: ${motivo.trim()}`
              : null,
          link: "/pedidos",
        },
        `pedido:${id}:${r.pedido.status}`
      );
    }

    return NextResponse.json({ item: r.pedido });
  } catch (e) {
    console.error("Falha ao mudar status do pedido:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
