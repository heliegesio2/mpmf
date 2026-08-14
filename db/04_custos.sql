-- 04_custos.sql
-- Modulo de custos/gastos: cada empresa registra seus proprios gastos
-- (frete, manutencao, compras avulsas etc), separado do estoque de produtos.
--
-- COMO RODAR: junto com os outros scripts numerados em db/, no banco em uso.
-- Idempotente: pode rodar de novo sem duplicar a tabela.

CREATE TABLE IF NOT EXISTS custo (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  servico    text NOT NULL,
  valor      numeric(10,2) NOT NULL CHECK (valor > 0),
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custo_empresa ON custo (empresa_id, criado_em DESC);
