import { NextResponse } from "next/server";
import { acharFornecedorParecido } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";
import { lerContaPagarDaFoto } from "@/lib/lerContaPagar";

export const dynamic = "force-dynamic";

const TIPOS_MIDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * POST /api/contas-pagar/ler-foto  { foto: "data:image/jpeg;base64,..." }
 * Lê o boleto/nota e devolve os campos pra preencher a tela + um fornecedor
 * já cadastrado parecido, se houver. Nada é gravado.
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const corpo = (await request.json()) as { foto?: string };
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(corpo.foto ?? "");
    if (!m || !TIPOS_MIDIA.has(m[1])) {
      return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
    }

    const dados = await lerContaPagarDaFoto(
      m[2],
      m[1] as "image/jpeg" | "image/png" | "image/webp"
    );

    const fornecedor = dados.fornecedorNome
      ? await acharFornecedorParecido(empresaId, dados.fornecedorNome, dados.fornecedorDocumento)
      : null;

    return NextResponse.json({ dados, fornecedor });
  } catch (e) {
    console.error("Falha ao ler a conta a pagar:", e);
    return NextResponse.json(
      { erro: "Não foi possível ler a foto. Tente uma foto mais nítida." },
      { status: 500 }
    );
  }
}
