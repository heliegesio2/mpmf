import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_CADASTRO_SOCIAL, lerCadastroSocial } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/social/pendente -> identidade social verificada aguardando o cadastro da loja. */
export async function GET() {
  const c = await cookies();
  const dados = await lerCadastroSocial(c.get(COOKIE_CADASTRO_SOCIAL)?.value);
  if (!dados) return NextResponse.json({ pendente: null });
  return NextResponse.json({
    pendente: { email: dados.email, nome: dados.nome, provedor: dados.provedor },
  });
}
