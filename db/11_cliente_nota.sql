-- 11_cliente_nota.sql
-- Nota do cliente (1 a 10). A media por CPF cruza TODAS as empresas de
-- proposito: e uma reputacao compartilhada pra ajudar na decisao de fiado.
-- Idempotente; espelhado em MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

ALTER TABLE cliente ADD COLUMN IF NOT EXISTS nota integer;
ALTER TABLE cliente DROP CONSTRAINT IF EXISTS cliente_nota_check;
ALTER TABLE cliente ADD CONSTRAINT cliente_nota_check CHECK (nota IS NULL OR nota BETWEEN 1 AND 10);

CREATE INDEX IF NOT EXISTS idx_cliente_cpf ON cliente ((regexp_replace(coalesce(cpf, ''), '\D', '', 'g')));
