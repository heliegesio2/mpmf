import { NextResponse } from "next/server";
import { fotoContaPagar } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/contas-pagar/:id/foto -> a foto do boleto/nota (bytes), ou 404. */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Conta inválida." }, { status: 400 });

  const dataUrl = await fotoContaPagar(empresaId, id);
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
