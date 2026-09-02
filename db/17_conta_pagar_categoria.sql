-- 17_conta_pagar_categoria.sql
-- Categoria da conta a pagar (mercadoria, luz, água, aluguel, boleto…).
-- Texto livre com valores controlados na aplicação. Idempotente; espelhado
-- em MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

ALTER TABLE conta_pagar ADD COLUMN IF NOT EXISTS categoria text;
