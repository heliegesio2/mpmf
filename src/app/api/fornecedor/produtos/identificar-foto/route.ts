import { NextResponse } from "next/server";
import { identificarNomeDaFoto } from "@/lib/identificarProdutoFoto";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/fornecedor/produtos/identificar-foto { foto } -> { nome }
 * Lê a embalagem na foto e sugere o nome. Falha aqui não é fatal.
 */
export async function POST(request: Request) {
  const { erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const { foto } = (await request.json()) as { foto?: string };
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(foto ?? "");
    if (!m || !TIPOS.has(m[1])) {
      return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
    }
    const nome = await identificarNomeDaFoto({
      base64: m[2],
      mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp",
    });
    return NextResponse.json({ nome });
  } catch (e) {
    // identificação é um plus — falha não é fatal pro cadastro
    console.error("Falha ao identificar produto pela foto:", e);
    return NextResponse.json({ nome: "" });
  }
}
