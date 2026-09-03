import { NextResponse } from "next/server";
import {
  contarNaoLidas,
  listarNotificacoes,
  sincronizarAvisosDeAnotacoes,
} from "@/lib/db";
import { destinoDaSessao } from "@/lib/destinoNotificacao";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * GET /api/notificacoes          -> { itens, naoLidas }
 * GET /api/notificacoes?resumo=1 -> { naoLidas }
 * Antes de responder, materializa os avisos das anotações vencidas da empresa.
 */
export async function GET(request: Request) {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  const destino = destinoDaSessao(sessao);
  if (!destino) return NextResponse.json({ itens: [], naoLidas: 0 });

  try {
    if ("usuarioId" in destino && sessao.empresaId) {
      await sincronizarAvisosDeAnotacoes(destino.usuarioId, sessao.empresaId);
    }

    const naoLidas = await contarNaoLidas(destino);
    if (new URL(request.url).searchParams.get("resumo") === "1") {
      return NextResponse.json({ naoLidas });
    }
    const itens = await listarNotificacoes(destino);
    return NextResponse.json({ itens, naoLidas });
  } catch (e) {
    console.error("Falha ao carregar notificações:", e);
    return NextResponse.json({ itens: [], naoLidas: 0 });
  }
}
