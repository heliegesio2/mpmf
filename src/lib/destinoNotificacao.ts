import type { Sessao } from "@/lib/auth";
import type { Destino } from "@/lib/db";

/**
 * Quem é o destinatário dos avisos nesta sessão: o fornecedor (login público) ou
 * o usuário. Super admin sem nada disso → null (sem caixa de avisos própria).
 */
export function destinoDaSessao(sessao: Sessao): Destino | null {
  if (sessao.papel === "fornecedor" && sessao.fornecedorId) {
    return { fornecedorId: sessao.fornecedorId };
  }
  if (sessao.usuarioId > 0) return { usuarioId: sessao.usuarioId };
  return null;
}
