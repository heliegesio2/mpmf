-- 43_fiado_venda.sql — liga o fiado à venda que o gerou, pra excluir junto quando
-- a venda for excluída em /vendas, e guarda os fiados apagados no log.
-- Vendas anteriores a esta migração ficam sem vínculo (venda_id NULL).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts) e em
-- ../mpmf-desktop/src/lib/schema.ts.

ALTER TABLE fiado ADD COLUMN IF NOT EXISTS venda_id bigint;
CREATE INDEX IF NOT EXISTS idx_fiado_venda ON fiado (venda_id) WHERE venda_id IS NOT NULL;
ALTER TABLE venda_exclusao ADD COLUMN IF NOT EXISTS fiados jsonb NOT NULL DEFAULT '[]';
