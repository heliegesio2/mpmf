-- 40_contas_recorrentes.sql
-- Recorrencia com buffer de parcelas futuras pra conta_pagar e fiado: cada
-- serie guarda sempre `recorrente_parcelas` lancamentos pendentes gerados a
-- frente (nao so 1, como era antes pra conta_pagar), ligados pelo `serie_id`
-- (aponta pro id da propria linha-raiz da serie). Fiado ganha vencimento
-- opcional pra qualquer lancamento (recorrente ou nao), alem de recorrencia
-- igual a conta_pagar. Idempotente; espelhado em MIGRACOES_IDEMPOTENTES no
-- src/lib/db.ts.

ALTER TABLE conta_pagar ADD COLUMN IF NOT EXISTS recorrente_parcelas integer;
ALTER TABLE conta_pagar ADD COLUMN IF NOT EXISTS serie_id bigint;
CREATE INDEX IF NOT EXISTS idx_conta_pagar_serie ON conta_pagar (serie_id) WHERE serie_id IS NOT NULL;

ALTER TABLE fiado ADD COLUMN IF NOT EXISTS vencimento date;
ALTER TABLE fiado ADD COLUMN IF NOT EXISTS recorrente boolean NOT NULL DEFAULT false;
ALTER TABLE fiado ADD COLUMN IF NOT EXISTS recorrente_parcelas integer;
ALTER TABLE fiado ADD COLUMN IF NOT EXISTS serie_id bigint;
CREATE INDEX IF NOT EXISTS idx_fiado_serie ON fiado (serie_id) WHERE serie_id IS NOT NULL;
