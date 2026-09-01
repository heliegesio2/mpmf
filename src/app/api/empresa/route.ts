import { NextResponse } from "next/server";
import { configEmpresa, salvarConfigEmpresa } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/empresa -> dados da empresa do usuario logado. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const item = await configEmpresa(empresaId);
    if (!item) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao carregar a empresa:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível carregar.", detalhe }, { status: 500 });
  }
}

/** PUT /api/empresa -> salva os dados proprios (empresa vem da sessao). */
export async function PUT(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = (await request.json()) as Record<string, unknown>;
    const texto = (v: unknown) => {
      const t = String(v ?? "").trim();
      return t || null;
    };
    const nome = String(c.nome ?? "").trim();
    if (nome.length < 2) {
      return NextResponse.json({ erro: "Informe o nome da empresa." }, { status: 400 });
    }

    const item = await salvarConfigEmpresa(empresaId, {
      nome,
      documento: texto(c.documento),
      telefone: texto(c.telefone),
      cidade: texto(c.cidade),
      cep: texto(c.cep),
      endereco: texto(c.endereco),
      horario: texto(c.horario),
      pixChave: texto(c.pixChave),
      pixNome: texto(c.pixNome),
    });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao salvar a empresa:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
