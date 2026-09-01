import { NextResponse } from "next/server";
import { criarCliente, listarClientes } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const MAX_FOTO = 3_000_000;

/** GET /api/clientes?q=termo -> clientes da empresa (com saldo devedor). */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ itens: await listarClientes(empresaId, q) });
  } catch (e) {
    console.error("Falha ao listar clientes:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível listar.", detalhe }, { status: 500 });
  }
}

/** POST /api/clientes -> cadastra um cliente (foto e endereco obrigatorios). */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = (await request.json()) as Record<string, unknown>;
    const nome = String(c.nome ?? "").trim();
    const endereco = String(c.endereco ?? "").trim();
    const foto = String(c.foto ?? "");

    if (nome.length < 2) {
      return NextResponse.json({ erro: "Informe o nome do cliente." }, { status: 400 });
    }
    if (endereco.length < 2) {
      return NextResponse.json({ erro: "O endereço do cliente é obrigatório." }, { status: 400 });
    }
    if (!/^data:image\/(jpe?g|png|webp);base64,/.test(foto)) {
      return NextResponse.json({ erro: "A foto do cliente é obrigatória." }, { status: 400 });
    }
    if (foto.length > MAX_FOTO) {
      return NextResponse.json({ erro: "A foto ficou grande demais. Tente de novo." }, { status: 400 });
    }

    const item = await criarCliente(empresaId, {
      nome,
      cpf: c.cpf ? String(c.cpf).trim() || null : null,
      telefone: c.telefone ? String(c.telefone).trim() || null : null,
      whatsapp: Boolean(c.whatsapp),
      endereco,
      cep: c.cep ? String(c.cep).trim() || null : null,
      foto,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Falha ao cadastrar cliente:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
