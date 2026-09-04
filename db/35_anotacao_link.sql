-- db/35 — link opcional da anotação (o aviso do super admin pode apontar pra
-- um módulo específico do sistema em vez de sempre cair em /anotacoes).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

ALTER TABLE anotacao ADD COLUMN IF NOT EXISTS link text;
