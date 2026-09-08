import { NextResponse } from "next/server";
import { statusPagamentoPix, tokenValidoMP } from "@/lib/mercadopago";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * GET /api/pix/status?id=<paymentId>
 * Consultado pelo painel do Pix enquanto espera — só existe pra loja com
 * Mercado Pago conectado (Pix estático não tem confirmação automática).
 */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "id obrigatório." }, { status: 400 });

  const mp = await tokenValidoMP(empresaId);
  if (!mp) return NextResponse.json({ erro: "Mercado Pago não conectado." }, { status: 400 });

  try {
    const status = await statusPagamentoPix(mp.accessToken, id);
    return NextResponse.json({ status });
  } catch (e) {
    console.error("Falha ao consultar o Pix:", e);
    return NextResponse.json({ erro: "Não foi possível consultar o pagamento." }, { status: 500 });
  }
}
