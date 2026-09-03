import { NextResponse } from "next/server";
import { contarNaoLidas, marcarNotificacaoLida } from "@/lib/db";
import { destinoDaSessao } from "@/lib/destinoNotificacao";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/notificacoes/:id { lida: true } -> marca um aviso como lido. */
export async function PATCH(_request: Request, { params }: Ctx) {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  const destino = destinoDaSessao(sessao);
  if (!destino) return NextResponse.json({ ok: true, naoLidas: 0 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Aviso inválido." }, { status: 400 });
  }

  try {
    await marcarNotificacaoLida(destino, id);
    return NextResponse.json({ ok: true, naoLidas: await contarNaoLidas(destino) });
  } catch (e) {
    console.error("Falha ao marcar aviso como lido:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
