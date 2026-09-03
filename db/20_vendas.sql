-- 20_vendas.sql — registro de vendas concluídas (a tela /vendas).
-- Até aqui a venda não deixava rastro nenhum além do fiado e da baixa de estoque.
-- `venda.data` é a data LOCAL do balcão, mandada pelo cliente, para o filtro por
-- dia não depender do fuso do servidor (Vercel roda em UTC).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts) e em
-- ../mpmf-desktop/src/lib/schema.ts.

CREATE TABLE IF NOT EXISTS venda (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  data       date NOT NULL DEFAULT CURRENT_DATE,
  total      numeric(10,2) NOT NULL DEFAULT 0,
  qtd_itens  integer NOT NULL DEFAULT 0,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venda_empresa_data ON venda (empresa_id, data DESC, criado_em DESC);

CREATE TABLE IF NOT EXISTS venda_item (
  id         bigserial PRIMARY KEY,
  venda_id   bigint NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
  produto_id bigint,                       -- null se o produto for excluído depois
  nome       text NOT NULL,                -- snapshot do nome no momento da venda
  quantidade numeric(12,3) NOT NULL,
  preco_unit numeric(10,2) NOT NULL,
  tipo_venda text NOT NULL DEFAULT 'unidade'
);
CREATE INDEX IF NOT EXISTS idx_venda_item_venda ON venda_item (venda_id);

CREATE TABLE IF NOT EXISTS venda_pagamento (
  id       bigserial PRIMARY KEY,
  venda_id bigint NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
  forma    text NOT NULL,                  -- dinheiro | debito | credito | pix | fiado
  valor    numeric(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_venda_pagamento_venda ON venda_pagamento (venda_id);
