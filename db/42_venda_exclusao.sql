-- 42_venda_exclusao.sql — log de vendas excluídas (botão "Excluir" em /vendas).
-- A venda some de venda/venda_item/venda_pagamento (e o estoque volta); aqui fica
-- um snapshot dela + quem excluiu e quando.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts) e em
-- ../mpmf-desktop/src/lib/schema.ts.

CREATE TABLE IF NOT EXISTS venda_exclusao (
  id             bigserial PRIMARY KEY,
  empresa_id     bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  venda_id       bigint NOT NULL,              -- id que a venda tinha (já não existe mais)
  venda_data     date,
  venda_criado_em timestamptz,
  total          numeric(10,2) NOT NULL DEFAULT 0,
  itens          jsonb NOT NULL DEFAULT '[]',
  pagamentos     jsonb NOT NULL DEFAULT '[]',
  usuario_id     bigint,
  usuario_nome   text NOT NULL,
  excluido_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venda_exclusao_empresa ON venda_exclusao (empresa_id, excluido_em DESC);
