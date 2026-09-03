import { NextResponse } from "next/server";
import { criarFornecedorPublico } from "@/lib/db";
import { gerarHashSenha } from "@/lib/senha";

export const dynamic = "force-dynamic";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * POST /api/fornecedores/cadastro — cadastro PÚBLICO de fornecedor.
 * Nasce `pendente`; o super admin aprova depois. Guarda os bairros que ele
 * atende (a cidade inicial é Conselheiro Lafaiete).
 */
export async function POST(request: Request) {
  try {
    const c = await request.json();

    const nome = String(c.nome ?? "").trim();
    const email = String(c.email ?? "").trim();
    const senha = String(c.senha ?? "");
    const cidade = String(c.cidade ?? "").trim() || "Conselheiro Lafaiete";
    const documento = String(c.documento ?? "").replace(/\D/g, "");
    const bairroIds = Array.isArray(c.bairroIds)
      ? c.bairroIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n))
      : [];

    if (nome.length < 2) {
      return NextResponse.json({ erro: "Informe o nome do fornecedor." }, { status: 400 });
    }
    if (!EMAIL.test(email)) {
      return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
    }
    if (senha.length < 8) {
      return NextResponse.json({ erro: "A senha precisa ter ao menos 8 caracteres." }, { status: 400 });
    }
    if (documento && documento.length !== 11 && documento.length !== 14) {
      return NextResponse.json({ erro: "CNPJ ou CPF inválido." }, { status: 400 });
    }
    if (bairroIds.length === 0) {
      return NextResponse.json(
        { erro: "Escolha pelo menos um bairro que você atende." },
        { status: 400 }
      );
    }

    await criarFornecedorPublico({
      nome,
      documento: documento || null,
      telefone: String(c.telefone ?? "").trim() || null,
      telefoneWhatsapp: Boolean(c.telefoneWhatsapp),
      endereco: String(c.endereco ?? "").trim() || null,
      observacao: String(c.observacao ?? "").trim() || null,
      pixChave: String(c.pixChave ?? "").trim() || null,
      email,
      senhaHash: await gerarHashSenha(senha),
      cidade,
      bairroIds,
    });

    return NextResponse.json(
      { ok: true, aviso: "Cadastro enviado. Aguarde a aprovação para acessar." },
      { status: 201 }
    );
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "EMAIL_DUP") {
      return NextResponse.json({ erro: err.message ?? "E-mail já cadastrado." }, { status: 409 });
    }
    if (err?.code === "23505") {
      return NextResponse.json({ erro: "Este e-mail já está cadastrado." }, { status: 409 });
    }
    console.error("Falha ao cadastrar fornecedor público:", e);
    return NextResponse.json({ erro: "Não foi possível cadastrar." }, { status: 500 });
  }
}
