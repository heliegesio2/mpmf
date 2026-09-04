-- db/33 — avisos do super admin (viram anotação na loja, empresário só pode
-- marcar como lida/concluída, não excluir) + reaviso a cada 2 dias enquanto a
-- anotação continuar aberta e já lida.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

ALTER TABLE anotacao ADD COLUMN IF NOT EXISTS de_admin boolean NOT NULL DEFAULT false;
ALTER TABLE notificacao ADD COLUMN IF NOT EXISTS lida_em timestamptz;
-- true quando o corpo é um bloco de HTML (só acontece em avisos de de_admin) —
-- a tela renderiza com dangerouslySetInnerHTML nesse caso.
ALTER TABLE notificacao ADD COLUMN IF NOT EXISTS html boolean NOT NULL DEFAULT false;
