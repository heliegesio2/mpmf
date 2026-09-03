import { NextResponse } from "next/server";
import { atualizarFornecedorPublico, fornecedorPublicoDetalhe } from "@/lib/db";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/fornecedor -> os dados do fornecedor logado + bairros + bairros da cidade. */
export async function GET() {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const item = await fornecedorPublicoDetalhe(fornecedorId);
    if (!item) return NextResponse.json({ erro: "Cadastro não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao carregar fornecedor:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível carregar.", detalhe }, { status: 500 });
  }
}

/** PUT /api/fornecedor -> o fornecedor edita o próprio cadastro (dados + bairros). */
export async function PUT(request: Request) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const c = await request.json();
    const nome = String(c.nome ?? "").trim();
    const documento = String(c.documento ?? "").replace(/\D/g, "");
    const cidade = String(c.cidade ?? "").trim();
    const bairroIds = Array.isArray(c.bairroIds)
      ? c.bairroIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n))
      : [];

    if (nome.length < 2) {
      return NextResponse.json({ erro: "Informe o nome." }, { status: 400 });
    }
    if (documento && documento.length !== 11 && documento.length !== 14) {
      return NextResponse.json({ erro: "CNPJ ou CPF inválido." }, { status: 400 });
    }
    if (!cidade) {
      return NextResponse.json({ erro: "Informe a cidade que você atende." }, { status: 400 });
    }
    if (bairroIds.length === 0) {
      return NextResponse.json({ erro: "Escolha pelo menos um bairro." }, { status: 400 });
    }

    const ok = await atualizarFornecedorPublico(fornecedorId, {
      nome,
      documento: documento || null,
      telefone: String(c.telefone ?? "").trim() || null,
      telefoneWhatsapp: Boolean(c.telefoneWhatsapp),
      endereco: String(c.endereco ?? "").trim() || null,
      observacao: String(c.observacao ?? "").trim() || null,
      pixChave: String(c.pixChave ?? "").trim() || null,
      cidade,
      bairroIds,
    });
    if (!ok) return NextResponse.json({ erro: "Cadastro não encontrado." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao salvar fornecedor:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
