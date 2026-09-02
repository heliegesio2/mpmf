-- 19_fornecedor_pix.sql
-- Chave Pix do fornecedor — pra copiar na hora de pagar uma conta.
-- Idempotente; espelhado em MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

ALTER TABLE fornecedor ADD COLUMN IF NOT EXISTS pix_chave text;
