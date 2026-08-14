import { NextResponse } from "next/server";
import { listarUsuariosDaEmpresa } from "@/lib/db";
import { exigirSuperAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/empresas/:id/usuarios -> lista os usuários daquela empresa. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Empresa inválida." }, { status: 400 });
  }

  try {
    return NextResponse.json({ itens: await listarUsuariosDaEmpresa(id) });
  } catch (e) {
    console.error("Falha ao listar usuários da empresa:", e);
    return NextResponse.json({ erro: "Não foi possível listar os usuários." }, { status: 500 });
  }
}
