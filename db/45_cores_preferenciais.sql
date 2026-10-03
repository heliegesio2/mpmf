-- 45_cores_preferenciais.sql — cores preferenciais da empresa e do fornecedor
-- (lista de "#rrggbb" em jsonb), escolhidas no cadastro e editáveis depois.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts). Não vai pro desktop.

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cores jsonb NOT NULL DEFAULT '[]';
ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS cores jsonb NOT NULL DEFAULT '[]';
