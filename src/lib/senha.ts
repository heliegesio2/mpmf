/**
 * Hash de senha com scrypt do Node — só roda no servidor (runtime Node.js).
 *
 * Fica separado de auth.ts porque este último é importado pelo middleware,
 * que roda no Edge Runtime e não sabe lidar com "node:crypto".
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, sal, 64).toString("hex");
  return `scrypt$${sal}$${hash}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, sal, hash] = guardado.split("$");
  if (algoritmo !== "scrypt" || !sal || !hash) return false;

  const calculado = scryptSync(senha, sal, 64);
  const esperado = Buffer.from(hash, "hex");
  if (calculado.length !== esperado.length) return false;
  // comparação de tempo constante: evita descobrir a senha medindo a resposta
  return timingSafeEqual(calculado, esperado);
}
