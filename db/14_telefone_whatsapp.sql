-- 14_telefone_whatsapp.sql
-- Marca "esse telefone e WhatsApp" onde ainda nao tinha (cliente ja tem a
-- coluna `whatsapp` desde db/10). Idempotente; espelhado em
-- MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS telefone_whatsapp boolean NOT NULL DEFAULT false;
ALTER TABLE casco   ADD COLUMN IF NOT EXISTS telefone_whatsapp boolean NOT NULL DEFAULT false;
