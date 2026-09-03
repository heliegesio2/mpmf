-- db/30 — Importar compra: margem de lucro padrão da loja + registro das notas
-- fiscais já processadas (pra avisar quando a mesma nota é reenviada).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts) — aplicado sozinho na Neon.

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS margem_padrao numeric(6,2) NOT NULL DEFAULT 38;

CREATE TABLE IF NOT EXISTS compra_nota (
  id          bigserial PRIMARY KEY,
  empresa_id  bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  chave       text,          -- chave de acesso da NFe/NFC-e (44 dígitos), quando legível
  hash_imagem text NOT NULL, -- sha256 da imagem enviada (pega o mesmo arquivo reenviado)
  numero      text,
  emitente    text,
  itens       integer NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compra_nota_hash ON compra_nota (empresa_id, hash_imagem);
CREATE INDEX IF NOT EXISTS ix_compra_nota_chave ON compra_nota (empresa_id, chave) WHERE chave IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_compra_nota_empresa ON compra_nota (empresa_id, criado_em DESC);
