-- 06_cascos.sql
-- Modulo de cascos: registra emprestimo de cascos (engradados/garrafas
-- retornaveis) para um responsavel, com controle de devolucao.
-- Idempotente: pode rodar de novo sem duplicar a tabela.

CREATE TABLE IF NOT EXISTS casco (
  id           bigserial PRIMARY KEY,
  empresa_id   bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  responsavel  text NOT NULL,
  telefone     text NOT NULL,
  endereco     text NOT NULL,
  quantidade   integer NOT NULL CHECK (quantidade > 0),
  devolvido    boolean NOT NULL DEFAULT false,
  devolvido_em timestamptz,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_casco_empresa ON casco (empresa_id, criado_em DESC);
