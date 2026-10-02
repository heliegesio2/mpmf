-- 41_conta_pagar_valor_variavel.sql
-- Conta a pagar recorrente de valor variavel (agua, luz…): a parcela vence
-- sempre no mesmo dia, mas o valor muda — o grid de /contas-pagar ganha um
-- campo pra digitar o valor real de cada parcela pendente. Tambem adiciona a
-- antecedencia de aviso (em dias) configuravel por loja, usada pelo cron
-- diario pra avisar antes do vencimento em vez de so no dia.
-- Idempotente; espelhado em MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

ALTER TABLE conta_pagar ADD COLUMN IF NOT EXISTS valor_variavel boolean NOT NULL DEFAULT false;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS aviso_dias_contas_pagar integer NOT NULL DEFAULT 0;
