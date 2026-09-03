import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/sessao";
import { interpretarFotoAnotacao } from "@/lib/lerFotoAnotacao";

export const dynamic = "force-dynamic";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/anotacoes/interpretar-foto { foto } -> { nome }
 * Lê o texto/lista/produto da foto e devolve na chave `nome` (pra plugar direto
 * no `aoIdentificarNome` do <CampoFoto>). Falha não é fatal.
 */
export async function POST(request: Request) {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const { foto } = (await request.json()) as { foto?: string };
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(foto ?? "");
    if (!m || !TIPOS.has(m[1])) {
      return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
    }
    const texto = await interpretarFotoAnotacao({
      base64: m[2],
      mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp",
    });
    return NextResponse.json({ nome: texto });
  } catch (e) {
    console.error("Falha ao interpretar a foto da anotação:", e);
    return NextResponse.json({ nome: "" });
  }
}
