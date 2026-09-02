import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** Usada pelo menu para saber quem esta logado. */
export async function GET() {
  const sessao = await sessaoAtual();
  if (!sessao) return NextResponse.json({ sessao: null });

  return NextResponse.json({
    sessao: {
      nome: sessao.nome,
      papel: sessao.papel,
      empresaNome: sessao.empresaNome,
      origem: sessao.origem ?? null,
    },
  });
}
