import { NextResponse } from "next/server";
import { criarCasco, listarCascos } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/cascos?situacao=emprestados|devolvidos|todas -> lista os empréstimos da empresa. */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const situacao = new URL(request.url).searchParams.get("situacao") ?? "emprestados";
  try {
    return NextResponse.json({ itens: await listarCascos(empresaId, situacao) });
  } catch (e) {
    console.error("Falha ao listar cascos:", e);
    return NextResponse.json({ erro: "Não foi possível listar." }, { status: 500 });
  }
}

/** POST /api/cascos { responsavel, telefone, endereco, quantidade } -> registra um novo empréstimo. */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = await request.json();
    const responsavel = String(c.responsavel ?? "").trim();
    const telefone = String(c.telefone ?? "").trim();
    const endereco = String(c.endereco ?? "").trim();
    const quantidade = Number(c.quantidade);

    if (responsavel.length < 2) {
      return NextResponse.json({ erro: "Informe o responsável." }, { status: 400 });
    }
    if (telefone.length < 8) {
      return NextResponse.json({ erro: "Informe um telefone válido." }, { status: 400 });
    }
    if (endereco.length < 2) {
      return NextResponse.json({ erro: "Informe o endereço." }, { status: 400 });
    }
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return NextResponse.json({ erro: "Informe a quantidade de cascos." }, { status: 400 });
    }

    const registrado = await criarCasco(empresaId, {
      responsavel,
      telefone,
      whatsapp: Boolean(c.whatsapp),
      endereco,
      quantidade,
      item: String(c.item ?? "").trim() || null,
    });
    return NextResponse.json({ item: registrado }, { status: 201 });
  } catch (e) {
    console.error("Falha ao registrar casco:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
