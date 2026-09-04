import { NextResponse } from "next/server";
import { atualizarLogoFornecedorPublico, logoFornecedorPublico } from "@/lib/db";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/fornecedor/logo -> a logo do próprio fornecedor (bytes), ou 404. */
export async function GET() {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const dataUrl = await logoFornecedorPublico(fornecedorId);
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

/** PUT /api/fornecedor/logo { logo } -> o fornecedor adiciona/troca/remove a logo. */
export async function PUT(request: Request) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const { logo } = (await request.json()) as { logo?: string };
    if (typeof logo !== "string" || !(logo === "" || logo.startsWith("data:image/"))) {
      return NextResponse.json({ erro: "Logo inválida." }, { status: 400 });
    }
    await atualizarLogoFornecedorPublico(fornecedorId, logo);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao salvar a logo do fornecedor:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
