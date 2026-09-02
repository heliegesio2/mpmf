import { NextResponse } from "next/server";
import { fotoProduto, atualizarFotoProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/produtos/:id/foto  { foto: "data:image/jpeg;base64,..." } -> só troca a foto. */
export async function PUT(request: Request, { params }: Ctx) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const c = (await request.json()) as { foto?: string };
    const foto = String(c.foto ?? "");
    if (!foto.startsWith("data:image/")) {
      return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
    }
    const ok = await atualizarFotoProduto(empresaId, id, foto);
    if (!ok) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao salvar a foto do produto:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}

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
