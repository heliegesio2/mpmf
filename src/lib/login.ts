import { criarToken } from "./auth";
import type { UsuarioLogin } from "./db";

export type ResultadoLogin =
  | { ok: false; erro: string; status: number }
  | {
      ok: true;
      token: string;
      expiraEm: Date;
      destino: string;
      nome: string;
      papel: UsuarioLogin["papel"];
      empresaNome: string | null;
    };

/**
 * Regras comuns a todo login (senha ou rede social): checa aprovação da
 * empresa e monta o token de sessão. Não seta o cookie — quem chama decide
 * (resposta JSON no login por senha, redirect no callback do OAuth).
 */
export async function autorizarLogin(usuario: UsuarioLogin): Promise<ResultadoLogin> {
  if (!usuario.ativo) {
    return { ok: false, erro: "Usuário desativado. Fale com o administrador da loja.", status: 403 };
  }

  if (usuario.papel !== "super_admin") {
    if (usuario.empresa_situacao === "pendente") {
      return { ok: false, erro: "A empresa ainda está aguardando aprovação.", status: 403 };
    }
    if (usuario.empresa_situacao === "reprovada") {
      return { ok: false, erro: "O cadastro desta empresa foi reprovado.", status: 403 };
    }
  }

  const { token, expiraEm } = await criarToken({
    usuarioId: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel,
    empresaId: usuario.empresa_id,
    empresaNome: usuario.empresa_nome,
  });

  return {
    ok: true,
    token,
    expiraEm,
    destino: usuario.papel === "super_admin" ? "/admin/empresas" : "/",
    nome: usuario.nome,
    papel: usuario.papel,
    empresaNome: usuario.empresa_nome,
  };
}
