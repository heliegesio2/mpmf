import { NextResponse } from "next/server";
import { gerarBrCode } from "@/lib/pix";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const MP_URL = "https://api.mercadopago.com/v1/payments";

/**
 * POST /api/pix  { valor, descricao, txid }
 *
 * Com MP_ACCESS_TOKEN configurado, cria uma cobranca no Mercado Pago e devolve
 * o id para acompanhar a confirmacao. Sem token, cai no QR estatico gerado da
 * chave — funciona para receber, mas nao avisa quando o cliente paga.
 */
export async function POST(request: Request) {
  const { erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const { valor, descricao, txid } = await request.json();

  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
  }

  const token = process.env.MP_ACCESS_TOKEN;

  if (token) {
    try {
      const r = await fetch(MP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Idempotency-Key": `${txid ?? "venda"}-${Date.now()}`,
        },
        body: JSON.stringify({
          transaction_amount: Number(valor.toFixed(2)),
          description: descricao ?? "Venda no balcão",
          payment_method_id: "pix",
          payer: { email: process.env.MP_EMAIL_CLIENTE ?? "cliente@exemplo.com" },
        }),
      });

      const dados = await r.json();

      if (!r.ok) {
        console.error("Mercado Pago recusou a cobrança:", dados);
        return NextResponse.json(
          { erro: dados?.message ?? "O Mercado Pago recusou a cobrança." },
          { status: 502 }
        );
      }

      const tx = dados?.point_of_interaction?.transaction_data;
      return NextResponse.json({
        modo: "mercadopago",
        pagamentoId: String(dados.id),
        copiaECola: tx?.qr_code ?? null,
        imagemBase64: tx?.qr_code_base64 ?? null,
        status: dados.status,
      });
    } catch (erro) {
      console.error("Falha ao falar com o Mercado Pago:", erro);
      // cai para o QR estático em vez de travar a venda
    }
  }

  const chave = process.env.PIX_CHAVE;
  if (!chave) {
    return NextResponse.json(
      { erro: "Configure PIX_CHAVE ou MP_ACCESS_TOKEN no .env.local." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    modo: "estatico",
    copiaECola: gerarBrCode({
      chave,
      valor,
      nome: process.env.PIX_NOME ?? "MERCADINHO",
      cidade: process.env.PIX_CIDADE ?? "SAO PAULO",
      txid,
    }),
    status: "pending",
  });
}
