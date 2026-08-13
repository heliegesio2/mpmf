import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/pix/:id -> consulta a situacao da cobranca no Mercado Pago.
 * A tela de venda chama isso de poucos em poucos segundos ate aprovar.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = process.env.MP_ACCESS_TOKEN;

  if (!token) {
    return NextResponse.json({ erro: "Mercado Pago não configurado." }, { status: 400 });
  }

  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const dados = await r.json();

    if (!r.ok) {
      return NextResponse.json({ erro: "Não foi possível consultar." }, { status: 502 });
    }

    return NextResponse.json({
      status: dados.status, // pending | approved | rejected | cancelled
      detalhe: dados.status_detail,
      valor: dados.transaction_amount,
    });
  } catch (erro) {
    console.error("Falha ao consultar pagamento:", erro);
    return NextResponse.json({ erro: "Não foi possível consultar." }, { status: 500 });
  }
}
