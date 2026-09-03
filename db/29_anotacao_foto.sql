-- 29_anotacao_foto.sql
--
-- Foto opcional na anotação (data URL em coluna text, mesmo padrão de
-- produto.foto — fica FORA de CAMPOS_ANOTACAO, a lista só traz `tem_foto`;
-- os bytes vêm de GET /api/anotacoes/:id/foto).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

ALTER TABLE anotacao ADD COLUMN IF NOT EXISTS foto text;
