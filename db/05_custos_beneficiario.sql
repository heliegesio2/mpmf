-- 05_custos_beneficiario.sql
-- A tela de Gastos passa a ter 3 campos: descricao, beneficiario e valor
-- (antes so tinha "servico"). Idempotente: pode rodar de novo sem erro.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'custo' AND column_name = 'servico'
  ) THEN
    ALTER TABLE custo RENAME COLUMN servico TO descricao;
  END IF;
END $$;

ALTER TABLE custo ADD COLUMN IF NOT EXISTS beneficiario text NOT NULL DEFAULT '';
ALTER TABLE custo ALTER COLUMN beneficiario DROP DEFAULT;

-- ---------- Conferencia ----------
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'custo'
 ORDER BY ordinal_position;
