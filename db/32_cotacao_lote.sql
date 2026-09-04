-- db/32 — Comércios grandes vira um CRUD: cada análise ("lançamento") de um
-- estabelecimento é agrupada num cotacao_lote (data, quantidade de produtos,
-- quem fez), pra listar num grid e poder entrar e ver os produtos daquele dia.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

CREATE TABLE IF NOT EXISTS cotacao_lote (
  id              bigserial PRIMARY KEY,
  empresa_id      bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  estabelecimento text NOT NULL,
  usuario_id      bigint REFERENCES usuario(id) ON DELETE SET NULL,
  usuario_nome    text,       -- snapshot do nome de quem lançou (sobrevive a troca de nome)
  fonte           text NOT NULL DEFAULT 'foto',
  qtd_produtos    integer NOT NULL DEFAULT 0,
  data            date NOT NULL DEFAULT CURRENT_DATE,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
-- um lote por estabelecimento/dia — reanálise no mesmo dia atualiza o lote
CREATE UNIQUE INDEX IF NOT EXISTS ux_cotacao_lote_dia ON cotacao_lote (empresa_id, estabelecimento, data);
CREATE INDEX IF NOT EXISTS ix_cotacao_lote_empresa ON cotacao_lote (empresa_id, estabelecimento, data DESC);

ALTER TABLE cotacao_concorrente ADD COLUMN IF NOT EXISTS lote_id bigint REFERENCES cotacao_lote(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_cotacao_conc_lote ON cotacao_concorrente (lote_id);
