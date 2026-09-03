import { NextResponse } from "next/server";
import { atualizarFotoAnotacao, fotoAnotacao } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/anotacoes/:id/foto -> a imagem da anotação (bytes), ou 404. */
export async function GET(_request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Inválido." }, { status: 400 });

  const dataUrl = await fotoAnotacao(empresaId, id);
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

/** PUT /api/anotacoes/:id/foto { foto } -> adiciona/troca a foto. */
export async function PUT(request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Inválido." }, { status: 400 });

  try {
    const { foto } = (await request.json()) as { foto?: string };
    if (typeof foto !== "string" || !(foto === "" || foto.startsWith("data:image/"))) {
      return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
    }
    const ok = await atualizarFotoAnotacao(empresaId, id, foto);
    if (!ok) return NextResponse.json({ erro: "Anotação não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao salvar a foto da anotação:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
