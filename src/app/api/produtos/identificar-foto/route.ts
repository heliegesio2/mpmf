import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/sessao";
import { identificarNomeDaFoto } from "@/lib/identificarProdutoFoto";

export const dynamic = "force-dynamic";

const TIPOS_MIDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/produtos/identificar-foto  { foto: "data:image/jpeg;base64,..." }
 * Devolve { nome } sugerido pra preencher o cadastro. Falha aqui não é fatal
 * pro cliente — ele só deixa o campo pro lojista digitar.
 */
export async function POST(request: Request) {
  const { erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  try {
    const corpo = (await request.json()) as { foto?: string };
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(corpo.foto ?? "");
    if (!m || !TIPOS_MIDIA.has(m[1])) {
      return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
    }

    const nome = await identificarNomeDaFoto({
      base64: m[2],
      mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp",
    });

    return NextResponse.json({ nome });
  } catch (erro) {
    console.error("Falha ao identificar produto pela foto:", erro);
    return NextResponse.json({ erro: "Não foi possível ler a foto." }, { status: 500 });
  }
}
