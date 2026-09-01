import { NextResponse } from "next/server";
import { fotoProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/produtos/:id/foto -> a imagem do produto (bytes), ou 404.
 * A foto fica guardada como data URL na coluna `produto.foto`; aqui ela é
 * decodificada e servida como imagem de verdade pra poder ir num <img src>.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  const dataUrl = await fotoProduto(empresaId, id);
  if (!dataUrl) {
    return NextResponse.json({ erro: "Sem foto." }, { status: 404 });
  }

  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) {
    return NextResponse.json({ erro: "Foto corrompida." }, { status: 500 });
  }

  const bytes = Buffer.from(m[2], "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(bytes.length),
      // a foto muda raramente e é da loja do usuário logado
      "Cache-Control": "private, max-age=300",
    },
  });
}
