import { NextResponse } from "next/server";
import { gerarBrCode } from "@/lib/pix";
import { configEmpresa } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/pix  { valor, txid }
 *
 * Gera o "Pix copia e cola" (QR estatico) a partir da chave configurada em
 * /configuracoes. Sem integracao com Mercado Pago: a confirmacao do pagamento
 * e manual, o caixa confere o comprovante antes de finalizar.
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
