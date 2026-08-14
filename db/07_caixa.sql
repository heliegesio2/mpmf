-- 07_caixa.sql
-- Modulo de caixa: fechamento diario com o valor final informado.
-- UNIQUE(empresa_id, data) garante um lancamento por dia por empresa,
-- mesmo se a tela deixar passar (corrida entre duas abas, por exemplo).
-- Idempotente: pode rodar de novo sem duplicar a tabela.

CREATE TABLE IF NOT EXISTS caixa (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  data       date NOT NULL DEFAULT CURRENT_DATE,
  valor      numeric(10,2) NOT NULL CHECK (valor >= 0),
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, data)
);

CREATE INDEX IF NOT EXISTS idx_caixa_empresa ON caixa (empresa_id, data DESC);
