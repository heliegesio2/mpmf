-- 15_foto_usuario.sql
-- Foto do próprio usuário (aparece no menu de conta, canto superior direito).
-- Data URL base64 num text, mesmo esquema de produto.foto / cliente.foto.
-- Idempotente; espelhado em MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS foto text;
