import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_SESSAO, lerToken, type Sessao } from "./auth";

/** Sessao do pedido atual, ou null se nao estiver logado. */
export async function sessaoAtual(): Promise<Sessao | null> {
  const c = await cookies();
  return lerToken(c.get(COOKIE_SESSAO)?.value);
}

/**
 * Usada nas rotas de API: devolve a sessao ou uma resposta pronta de erro.
 * O empresaId vem sempre da sessao, nunca do corpo do pedido — assim um
 * usuario nao consegue mexer nos dados de outra empresa trocando um id.
 */
export async function exigirSessao(): Promise<
  { sessao: Sessao; erro?: never } | { sessao?: never; erro: NextResponse }
> {
  const sessao = await sessaoAtual();
  if (!sessao) {
    return {
      erro: NextResponse.json({ erro: "Faça login para continuar." }, { status: 401 }),
    };
  }
  return { sessao };
}

/** Rotas que so o super admin pode acessar. */
export async function exigirSuperAdmin(): Promise<
  { sessao: Sessao; erro?: never } | { sessao?: never; erro: NextResponse }
> {
  const r = await exigirSessao();
  if (r.erro) return r;
  if (r.sessao.papel !== "super_admin") {
    return {
      erro: NextResponse.json({ erro: "Acesso restrito." }, { status: 403 }),
    };
  }
  return r;
}

/** Rotas da area do fornecedor (login publico). */
export async function exigirFornecedor(): Promise<
  { fornecedorId: number; sessao: Sessao; erro?: never }
  | { fornecedorId?: never; sessao?: never; erro: NextResponse }
> {
  const r = await exigirSessao();
  if (r.erro) return { erro: r.erro };
  if (r.sessao.papel !== "fornecedor" || !r.sessao.fornecedorId) {
    return { erro: NextResponse.json({ erro: "Acesso restrito ao fornecedor." }, { status: 403 }) };
  }
  return { fornecedorId: r.sessao.fornecedorId, sessao: r.sessao };
}

/** Empresa do usuario logado. O super admin nao opera loja. */
export async function exigirEmpresa(): Promise<
  { empresaId: number; sessao: Sessao; erro?: never }
  | { empresaId?: never; sessao?: never; erro: NextResponse }
> {
  const r = await exigirSessao();
  if (r.erro) return { erro: r.erro };
  if (!r.sessao.empresaId) {
    return {
      erro: NextResponse.json(
        { erro: "O super admin não tem loja própria. Entre com um usuário da empresa." },
        { status: 403 }
      ),
    };
  }
  return { empresaId: r.sessao.empresaId, sessao: r.sessao };
}
