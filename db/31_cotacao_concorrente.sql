-- db/31 — Comércios grandes: cotação de preços dos concorrentes.
--
-- O módulo "Comércios grandes" (/produtos/comercios-grandes) NÃO cadastra
-- produtos — ele lê os preços de um concorrente (vídeo, fotos ou PDF de encarte)
-- e compara com o meu catálogo e com a leitura anterior do mesmo estabelecimento.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

CREATE TABLE IF NOT EXISTS cotacao_concorrente (
  id              bigserial PRIMARY KEY,
  empresa_id      bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  estabelecimento text NOT NULL,
  nome_produto    text NOT NULL,          -- nome como foi lido
  nome_norm       text NOT NULL,          -- normalizado, pra agrupar o histórico
  preco           numeric(10,2) NOT NULL, -- preço lido no concorrente
  produto_id      bigint REFERENCES produto(id) ON DELETE SET NULL, -- match no meu catálogo
  meu_preco       numeric(10,2),          -- meu preço de venda no momento da análise
  fonte           text NOT NULL DEFAULT 'foto', -- video | foto | pdf
  data            date NOT NULL DEFAULT CURRENT_DATE,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
-- uma leitura por produto/estabelecimento/dia (reanálise no mesmo dia sobrescreve)
CREATE UNIQUE INDEX IF NOT EXISTS ux_cotacao_conc_dia
  ON cotacao_concorrente (empresa_id, estabelecimento, nome_norm, data);
CREATE INDEX IF NOT EXISTS ix_cotacao_conc_hist
  ON cotacao_concorrente (empresa_id, estabelecimento, nome_norm, data DESC);
