import { NextResponse } from "next/server";
import { criarFiado, listarFiado } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/fiado?situacao=abertas|pagas|todas */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const s = new URL(request.url).searchParams.get("situacao");
  const situacao = s === "pagas" || s === "todas" ? s : "abertas";
  try {
    return NextResponse.json({ itens: await listarFiado(empresaId, situacao) });
  } catch (e) {
    console.error("Falha ao listar fiado:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível listar.", detalhe }, { status: 500 });
  }
}

/**
 * POST /api/fiado { clienteId, valor, descricao, vencimento?, recorrente?, recorrenteParcelas? }
 * -> lanca um fiado (usado pela venda e pela tela de Contas a receber).
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = await request.json();
    const clienteId = Number(c.clienteId);
    const valor = Number(c.valor);
    if (!Number.isInteger(clienteId)) {
      return NextResponse.json({ erro: "Escolha o cliente." }, { status: 400 });
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ erro: "Valor de fiado inválido." }, { status: 400 });
    }

    const vencimento =
      typeof c.vencimento === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)
        ? c.vencimento
        : null;
    const recorrente = Boolean(c.recorrente);
    const recorrenteParcelas = Number.isInteger(Number(c.recorrenteParcelas))
      ? Number(c.recorrenteParcelas)
      : null;
    if (recorrente && !vencimento) {
      return NextResponse.json(
        { erro: "Conta recorrente precisa de um vencimento." },
        { status: 400 }
      );
    }
    if (recorrente && (!recorrenteParcelas || recorrenteParcelas < 1)) {
      return NextResponse.json(
        { erro: "Informe quantas parcelas manter geradas (1 ou mais)." },
        { status: 400 }
      );
    }

    const item = await criarFiado(
      empresaId,
      clienteId,
      valor,
      c.descricao ? String(c.descricao).trim() : null,
      vencimento,
      recorrente,
      recorrente ? recorrenteParcelas : null
    );
    if (!item) return NextResponse.json({ erro: "Cliente não encontrado." }, { status: 404 });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Falha ao lançar fiado:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
