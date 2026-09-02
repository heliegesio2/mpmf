import { NextResponse } from "next/server";
import { listarFornecedores, criarFornecedor } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

function limpar(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t || null;
}

/** GET /api/fornecedores?q= -> lista os fornecedores da empresa. */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ itens: await listarFornecedores(empresaId, q) });
  } catch (e) {
    console.error("Falha ao listar fornecedores:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível listar.", detalhe }, { status: 500 });
  }
}

/** POST /api/fornecedores -> cadastra um fornecedor. */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = await request.json();
    const nome = String(c.nome ?? "").trim();
    if (nome.length < 2) {
      return NextResponse.json({ erro: "Informe o nome do fornecedor." }, { status: 400 });
    }

    const item = await criarFornecedor(empresaId, {
      nome,
      documento: limpar(c.documento),
      telefone: limpar(c.telefone),
      telefoneWhatsapp: Boolean(c.telefoneWhatsapp),
      endereco: limpar(c.endereco),
      observacao: limpar(c.observacao),
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Falha ao cadastrar fornecedor:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
