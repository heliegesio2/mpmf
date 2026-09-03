import { NextResponse } from "next/server";
import { criarFornecedor, fornecedorPublicoPorId } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/diretorio/importar { fornecedorPublicoId }
 * Copia um fornecedor do diretório para a lista de fornecedores da loja.
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const { fornecedorPublicoId } = await request.json();
    const fp = await fornecedorPublicoPorId(Number(fornecedorPublicoId));
    if (!fp || fp.situacao !== "aprovado") {
      return NextResponse.json({ erro: "Fornecedor não disponível." }, { status: 404 });
    }

    const item = await criarFornecedor(empresaId, {
      nome: fp.nome,
      documento: fp.documento,
      telefone: fp.telefone,
      telefoneWhatsapp: fp.telefone_whatsapp,
      endereco: fp.endereco,
      observacao: fp.observacao,
      pixChave: fp.pix_chave,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Falha ao importar fornecedor do diretório:", e);
    return NextResponse.json({ erro: "Não foi possível adicionar." }, { status: 500 });
  }
}
