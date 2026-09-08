import { NextResponse } from "next/server";
import { gerarBrCode } from "@/lib/pix";
import { configEmpresa } from "@/lib/db";
import { criarPagamentoPix, tokenValidoMP } from "@/lib/mercadopago";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/pix  { valor, txid }
 *
 * Se a loja conectou o Mercado Pago (/configuracoes), cria uma cobrança Pix
 * de verdade na conta DELA — o dinheiro cai direto lá, e devolve um
 * paymentId pro cliente acompanhar a confirmação sozinho (GET /api/pix/status).
 * Sem conexão, cai no "Pix copia e cola" estático de sempre (chave configurada
 * em /configuracoes), com confirmação manual pelo caixa.
 */
export async function POST(request: Request) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const { valor, txid } = await request.json();
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
  }

  try {
    const emp = await configEmpresa(empresaId);

    const mp = await tokenValidoMP(empresaId);
    if (mp?.ativo) {
      const pagamento = await criarPagamentoPix({
        accessToken: mp.accessToken,
        valor,
        descricao: `Venda — ${emp?.nome ?? "PDV Já"}`,
        txid: String(txid ?? crypto.randomUUID()),
        payerEmail: "cliente.balcao@pdvja.com.br",
      });
      return NextResponse.json({ copiaECola: pagamento.qrCode, paymentId: pagamento.id });
    }

    const chave = emp?.pix_chave?.trim() || process.env.PIX_CHAVE?.trim();
    if (!chave) {
      return NextResponse.json(
        { erro: "Configure a chave Pix em Configurações." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      copiaECola: gerarBrCode({
        chave,
        valor,
        nome: emp?.pix_nome?.trim() || emp?.nome || process.env.PIX_NOME || "RECEBEDOR",
        cidade: emp?.cidade?.trim() || process.env.PIX_CIDADE || "SAO PAULO",
        txid,
      }),
    });
  } catch (e) {
    console.error("Falha ao gerar o Pix:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível gerar o Pix.", detalhe }, { status: 500 });
  }
}
