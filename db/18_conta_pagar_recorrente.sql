-- 18_conta_pagar_recorrente.sql
-- Marca uma conta como recorrente (aluguel, luz, internet…). Ao dar baixa
-- numa conta recorrente, o sistema já cria a do mês seguinte. Idempotente;
-- espelhado em MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

ALTER TABLE conta_pagar ADD COLUMN IF NOT EXISTS recorrente boolean NOT NULL DEFAULT false;
