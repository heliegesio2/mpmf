import { NextResponse } from "next/server";
import { criarCusto, listarCustos } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/custos -> lista os gastos da empresa logada, mais recentes primeiro. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    return NextResponse.json({ itens: await listarCustos(empresaId) });
  } catch (e) {
    console.error("Falha ao listar custos:", e);
    return NextResponse.json({ erro: "Não foi possível listar os gastos." }, { status: 500 });
  }
}

/** POST /api/custos { descricao, beneficiario, valor } -> inclui um novo gasto. */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = await request.json();
    const descricao = String(c.descricao ?? "").trim();
    const beneficiario = String(c.beneficiario ?? "").trim();
    const valor = Number(c.valor);

    if (descricao.length < 2) {
      return NextResponse.json({ erro: "Informe a descrição do gasto." }, { status: 400 });
    }
    if (beneficiario.length < 2) {
      return NextResponse.json({ erro: "Informe o beneficiário." }, { status: 400 });
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ erro: "Informe um valor válido." }, { status: 400 });
    }

    const item = await criarCusto(empresaId, descricao, beneficiario, valor);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Falha ao criar custo:", e);
    return NextResponse.json({ erro: "Não foi possível salvar o gasto." }, { status: 500 });
  }
}
