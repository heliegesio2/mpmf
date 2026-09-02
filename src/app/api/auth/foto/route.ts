import { NextResponse } from "next/server";
import { fotoUsuario } from "@/lib/db";
import { exigirSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/auth/foto -> a foto do próprio usuário (bytes), ou 404. */
export async function GET() {
  const { sessao, erro } = await exigirSessao();
  if (erro) return erro;

  const dataUrl = await fotoUsuario(sessao.usuarioId);
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
      "Cache-Control": "private, max-age=60",
    },
  });
}
