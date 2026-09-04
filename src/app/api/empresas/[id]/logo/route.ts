import { NextResponse } from "next/server";
import { logoEmpresa } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/empresas/:id/logo -> a logo de QUALQUER empresa (bytes), ou 404.
 * Cross-tenant de propósito: é como o "Comércios grandes" mostra a logo da
 * loja parceira que fez o levantamento de preço — não é dado sensível.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { erro } = await exigirSessao();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Inválido." }, { status: 400 });

  const dataUrl = await logoEmpresa(id);
  if (!dataUrl) return NextResponse.json({ erro: "Sem logo." }, { status: 404 });
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return NextResponse.json({ erro: "Logo corrompida." }, { status: 500 });

  const bytes = Buffer.from(m[2], "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
