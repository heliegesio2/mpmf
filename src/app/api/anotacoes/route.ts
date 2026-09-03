import { NextResponse } from "next/server";
import { criarAnotacao, listarAnotacoes } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/anotacoes?situacao=abertas|concluidas|todas */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const situacao = new URL(request.url).searchParams.get("situacao") ?? "abertas";
  try {
    return NextResponse.json({ itens: await listarAnotacoes(empresaId, situacao) });
  } catch (e) {
    console.error("Falha ao listar anotações:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível listar.", detalhe }, { status: 500 });
  }
}

/** POST /api/anotacoes { texto, dataAlerta?, foto? } */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = await request.json();
    const texto = String(c.texto ?? "").trim();
    if (texto.length < 2) {
      return NextResponse.json({ erro: "Escreva a anotação." }, { status: 400 });
    }
    const dataAlerta = typeof c.dataAlerta === "string" && DIA.test(c.dataAlerta) ? c.dataAlerta : null;
    const foto = typeof c.foto === "string" && c.foto.startsWith("data:image/") ? c.foto : undefined;

    const item = await criarAnotacao(empresaId, texto.slice(0, 2000), dataAlerta, foto);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Falha ao criar anotação:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
