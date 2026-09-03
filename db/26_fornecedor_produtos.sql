-- 26_fornecedor_produtos.sql
--
-- Catálogo de produtos do fornecedor público + portfólio.
--
-- O fornecedor (login em /fornecedor) cadastra os produtos que vende — foto,
-- categoria e preços (por unidade, desconto por quantidade, caixa fechada). A
-- partir disso o app monta uma página de portfólio pública em /p/<slug> que ele
-- compartilha no WhatsApp e que as lojas também veem no /diretorio.
--
-- `foto` e `portfolio_pdf` ficam como base64 em colunas `text` (mesmo padrão de
-- produto.foto) e nunca entram numa query de lista — os bytes vêm de rotas
-- dedicadas.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts). Não vai pro desktop.

CREATE TABLE IF NOT EXISTS fornecedor_produto (
  id                    bigserial PRIMARY KEY,
  fornecedor_publico_id bigint NOT NULL REFERENCES fornecedor_publico(id) ON DELETE CASCADE,
  nome                  text NOT NULL,
  categoria             text NOT NULL DEFAULT '',
  foto                  text,
  preco_unidade         numeric,
  preco_desconto        numeric,
  desconto_qtd_min      integer,
  preco_caixa           numeric,
  caixa_qtd             integer,
  ordem                 integer NOT NULL DEFAULT 0,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fornecedor_produto_forn ON fornecedor_produto (fornecedor_publico_id);

ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fornecedor_publico_slug ON fornecedor_publico (slug) WHERE slug IS NOT NULL;

ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS portfolio_pdf text;
