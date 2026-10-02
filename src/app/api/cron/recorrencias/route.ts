import { NextResponse } from "next/server";
import { processarRecorrenciasEAlertas } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/recorrencias — disparado todo dia de manhã pelo Vercel Cron
 * (ver "crons" em vercel.json). Garante o buffer de parcelas de toda conta
 * recorrente (pagar/receber) e avisa cada loja que tenha algo vencendo hoje.
 * Protegido por CRON_SECRET: sem a variável configurada, a rota 503 (nada
 * roda sozinho sem querer); com ela, só aceita o cabeçalho que a Vercel
 * manda automaticamente nas chamadas de cron.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return NextResponse.json({ erro: "CRON_SECRET não configurado." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const resultado = await processarRecorrenciasEAlertas();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    console.error("Falha no cron de recorrências/alertas:", erro);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return NextResponse.json({ erro: "Falha ao processar.", detalhe }, { status: 500 });
  }
}
