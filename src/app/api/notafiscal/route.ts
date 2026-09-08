import { NextResponse } from "next/server";
import { atualizarAmbienteFocusNFe, desconectarFocusNFeEmpresa, focusNFeDaEmpresa } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/notafiscal -> se a loja conectou o Focus NFe, e em qual ambiente. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const fn = await focusNFeDaEmpresa(empresaId);
  return NextResponse.json({
    conectado: Boolean(fn),
    ambiente: fn?.ambiente ?? "homologacao",
    temProducao: Boolean(fn?.tokenProducao),
  });
}

/** PATCH /api/notafiscal { ambiente } -> troca entre homologação (teste) e produção. */
export async function PATCH(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const { ambiente } = await request.json();
  if (ambiente !== "producao" && ambiente !== "homologacao") {
    return NextResponse.json({ erro: "Ambiente inválido." }, { status: 400 });
  }

  const fn = await focusNFeDaEmpresa(empresaId);
  if (ambiente === "producao" && !fn?.tokenProducao) {
    return NextResponse.json(
      { erro: "As credenciais de produção do Focus NFe ainda não foram liberadas pra essa empresa." },
      { status: 400 }
    );
  }

  await atualizarAmbienteFocusNFe(empresaId, ambiente);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/notafiscal -> desconecta (a empresa continua cadastrada no Focus NFe). */
export async function DELETE() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  await desconectarFocusNFeEmpresa(empresaId);
  return NextResponse.json({ ok: true });
}
