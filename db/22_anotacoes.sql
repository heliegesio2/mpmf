-- 22_anotacoes.sql — o módulo Anotações (lembretes com data de alerta).
-- `data_alerta` é opcional; quando <= hoje e a anotação não está concluída, ela
-- conta como "em alerta" (badge no menu, ver anotacoesEmAlerta em db.ts).
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts) e no schema do desktop.

CREATE TABLE IF NOT EXISTS anotacao (
  id          bigserial PRIMARY KEY,
  empresa_id  bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  texto       text NOT NULL,
  data_alerta date,
  concluida   boolean NOT NULL DEFAULT false,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anotacao_empresa ON anotacao (empresa_id, concluida, data_alerta);
