import { NextResponse } from "next/server";
import { atualizarFotoProdutoFornecedor, fotoProdutoFornecedor } from "@/lib/db";
import { melhorarFotoProduto } from "@/lib/melhorarImagemProduto";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PUT /api/fornecedor/produtos/:id/foto { foto } -> troca só a foto (add rápido
 * pela lista). Passa pela melhoria de imagem (fundo branco) quando possível.
 */
export async function PUT(request: Request, { params }: Ctx) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const { foto } = (await request.json()) as { foto?: string };
    if (typeof foto !== "string" || !foto.startsWith("data:image/")) {
      return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
    }
    const { foto: melhor } = await melhorarFotoProduto(foto);
    const ok = await atualizarFotoProdutoFornecedor(fornecedorId, id, melhor);
    if (!ok) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao salvar a foto do produto:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}

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
