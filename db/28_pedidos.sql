-- 28_pedidos.sql
--
-- Pedidos da loja pro fornecedor público. A loja abre o catálogo do fornecedor
-- em /pedido/<slug>, escolhe produtos + quantidades (un ou caixa), envia. O
-- fornecedor vê em /fornecedor/pedidos (mais novo primeiro) e muda o status
-- (novo → visto → atendido/cancelado). Cada evento dispara um aviso pela
-- messageria (db/27). Preço e nome ficam "congelados" no pedido_item.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts). Não vai pro desktop.

CREATE TABLE IF NOT EXISTS pedido (
  id                    bigserial PRIMARY KEY,
  empresa_id            bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  fornecedor_publico_id bigint NOT NULL REFERENCES fornecedor_publico(id) ON DELETE CASCADE,
  criado_por_usuario_id bigint REFERENCES usuario(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'novo',
  observacao            text,
  motivo                text,
  total                 numeric(10,2) NOT NULL DEFAULT 0,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pedido_forn ON pedido (fornecedor_publico_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_pedido_empresa ON pedido (empresa_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS pedido_item (
  id                    bigserial PRIMARY KEY,
  pedido_id             bigint NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  fornecedor_produto_id bigint REFERENCES fornecedor_produto(id) ON DELETE SET NULL,
  nome                  text NOT NULL,
  unidade               text NOT NULL DEFAULT 'un',
  qtd                   integer NOT NULL,
  preco_unit            numeric(10,2) NOT NULL,
  subtotal              numeric(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_pedido_item_pedido ON pedido_item (pedido_id);
