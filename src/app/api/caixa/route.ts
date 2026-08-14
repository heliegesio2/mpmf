import { NextResponse } from "next/server";
import { criarCaixa, listarCaixa } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/caixa -> lista os fechamentos de caixa da empresa, mais recentes primeiro. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    return NextResponse.json({ itens: await listarCaixa(empresaId) });
  } catch (e) {
    console.error("Falha ao listar caixa:", e);
    return NextResponse.json({ erro: "Não foi possível listar." }, { status: 500 });
  }
}

/** POST /api/caixa { valor } -> registra o fechamento de hoje (um por dia). */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = await request.json();
    const valor = Number(c.valor);

    if (!Number.isFinite(valor) || valor < 0) {
      return NextResponse.json({ erro: "Informe um valor válido." }, { status: 400 });
    }

    const item = await criarCaixa(empresaId, valor);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "23505") {
      return NextResponse.json(
        { erro: "O caixa de hoje já foi registrado." },
        { status: 409 }
      );
    }
    console.error("Falha ao registrar caixa:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
