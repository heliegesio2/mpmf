-- db/37 — Importar compra vira uma tela de listagem: guarda os itens de cada
-- nota confirmada (não só a contagem) pra dar pra ver depois "o que entrou
-- naquele cupom, com o preço de cada um".
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

CREATE TABLE IF NOT EXISTS compra_nota_item (
  id             bigserial PRIMARY KEY,
  compra_nota_id bigint NOT NULL REFERENCES compra_nota(id) ON DELETE CASCADE,
  produto_id     bigint REFERENCES produto(id) ON DELETE SET NULL,
  nome           text NOT NULL,
  preco_compra   numeric(10,2) NOT NULL,
  preco_venda    numeric(10,2) NOT NULL,
  novo           boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ix_compra_nota_item_nota ON compra_nota_item (compra_nota_id);
