import { NextResponse } from "next/server";
import { fotoProdutoFornecedor } from "@/lib/db";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/fornecedor/produtos/:id/foto -> a imagem (bytes), ou 404. */
export async function GET(_request: Request, { params }: Ctx) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  const dataUrl = await fotoProdutoFornecedor(fornecedorId, id);
  if (!dataUrl) return NextResponse.json({ erro: "Sem foto." }, { status: 404 });

  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return NextResponse.json({ erro: "Foto corrompida." }, { status: 500 });

  const bytes = Buffer.from(m[2], "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=300",
    },
  });
}
