import { NextResponse } from "next/server";
import { marcarTodasLidas } from "@/lib/db";
import { destinoDaSessao } from "@/lib/destinoNotificacao";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** POST /api/notificacoes/marcar-todas -> marca todos os avisos como lidos. */
export async function POST() {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  const destino = destinoDaSessao(sessao);
  if (!destino) return NextResponse.json({ ok: true, naoLidas: 0 });

  try {
    await marcarTodasLidas(destino);
    return NextResponse.json({ ok: true, naoLidas: 0 });
  } catch (e) {
    console.error("Falha ao marcar todos os avisos:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
