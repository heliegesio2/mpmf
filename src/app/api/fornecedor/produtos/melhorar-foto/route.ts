import { NextResponse } from "next/server";
import { melhorarFotoProduto } from "@/lib/melhorarImagemProduto";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * POST /api/fornecedor/produtos/melhorar-foto { foto } -> { foto, melhorada }
 * Remove o fundo e devolve a imagem com fundo branco. Sem a chave da API ou em
 * qualquer falha, devolve a mesma foto (melhorada: false) — nunca é fatal.
 */
export async function POST(request: Request) {
  const { erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const { foto } = (await request.json()) as { foto?: string };
    if (typeof foto !== "string" || !foto.startsWith("data:image/")) {
      return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
    }
    const r = await melhorarFotoProduto(foto);
    return NextResponse.json(r);
  } catch (e) {
    console.error("Falha ao melhorar a foto:", e);
    return NextResponse.json({ erro: "Não foi possível processar a foto." }, { status: 500 });
  }
}
