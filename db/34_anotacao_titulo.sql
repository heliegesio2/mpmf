-- db/34 — título opcional da anotação (usado no aviso do super admin: o
-- título aparece no sino/lista em vez do trecho truncado do texto).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

ALTER TABLE anotacao ADD COLUMN IF NOT EXISTS titulo text;
