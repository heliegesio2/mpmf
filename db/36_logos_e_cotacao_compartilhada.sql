-- db/36 — logo da empresa e do fornecedor; Comércios grandes vira uma cotação
-- COMPARTILHADA entre lojas (feed global por estabelecimento) com opção de
-- silenciar avisos de um estabelecimento específico.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS logo text;
ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS logo text;

CREATE TABLE IF NOT EXISTS cotacao_silenciada (
  empresa_id      bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  estabelecimento text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, estabelecimento)
);
