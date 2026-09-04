import { NextResponse } from "next/server";
import { atualizarLogoEmpresa, logoEmpresa } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/empresa/logo -> a logo da própria loja (bytes), ou 404. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const dataUrl = await logoEmpresa(empresaId);
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

/** PUT /api/empresa/logo { logo } -> a própria loja adiciona/troca/remove a logo. */
export async function PUT(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const { logo } = (await request.json()) as { logo?: string };
    if (typeof logo !== "string" || !(logo === "" || logo.startsWith("data:image/"))) {
      return NextResponse.json({ erro: "Logo inválida." }, { status: 400 });
    }
    await atualizarLogoEmpresa(empresaId, logo);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao salvar a logo da empresa:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}
