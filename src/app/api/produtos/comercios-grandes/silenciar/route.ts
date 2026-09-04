import { NextResponse } from "next/server";
import { alternarSilencioEstabelecimento } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** POST /api/produtos/comercios-grandes/silenciar { estabelecimento, silenciar } */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = (await request.json()) as { estabelecimento?: string; silenciar?: boolean };
    const estabelecimento = String(c.estabelecimento ?? "").trim();
    if (estabelecimento.length < 2) {
      return NextResponse.json({ erro: "Estabelecimento inválido." }, { status: 400 });
    }
    await alternarSilencioEstabelecimento(empresaId, estabelecimento, Boolean(c.silenciar));
    return NextResponse.json({ ok: true, silenciado: Boolean(c.silenciar) });
  } catch (e) {
    console.error("Falha ao silenciar estabelecimento:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
