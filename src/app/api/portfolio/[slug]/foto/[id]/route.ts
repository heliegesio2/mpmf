import { NextResponse } from "next/server";
import { fotoProdutoPortfolio } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/** GET /api/portfolio/:slug/foto/:id -> imagem de um produto do portfólio público. */
export async function GET(_request: Request, { params }: Ctx) {
  const { slug, id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  const dataUrl = await fotoProdutoPortfolio(slug, id);
  if (!dataUrl) return NextResponse.json({ erro: "Sem foto." }, { status: 404 });

  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return NextResponse.json({ erro: "Foto corrompida." }, { status: 500 });

  const bytes = Buffer.from(m[2], "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=300",
    },
  });
}
