-- 01_schema.sql | PostgreSQL 14+
-- Busca tolerante a erro de digitacao e a transcricao de voz (sem acento, fonetica aproximada).

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS produto;

CREATE TABLE produto (
  id          bigserial PRIMARY KEY,
  codigo      text UNIQUE,
  nome        text NOT NULL,
  categoria   text,
  local       text,
  unidade     text NOT NULL DEFAULT 'unidade',
  preco       numeric(10,2) NOT NULL DEFAULT 0,
  estoque     numeric(12,3) NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  observacao  text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  alterado_em timestamptz NOT NULL DEFAULT now()
);

-- unaccent nao e IMMUTABLE por padrao; wrapper para poder indexar
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent', $1) $$;

-- termo de busca normalizado: nome + categoria, sem acento, minusculo
CREATE INDEX idx_produto_busca_trgm
  ON produto USING gin (f_unaccent(lower(nome || ' ' || coalesce(categoria,''))) gin_trgm_ops);

CREATE INDEX idx_produto_codigo ON produto (codigo) WHERE codigo IS NOT NULL;

-- Funcao de busca: ranqueia por similaridade e por prefixo/substring.
-- Ex.: SELECT * FROM buscar_produto('gulao pururuca', 8);
CREATE OR REPLACE FUNCTION buscar_produto(p_termo text, p_limite int DEFAULT 8)
RETURNS TABLE (
  id bigint, nome text, categoria text, local text,
  unidade text, preco numeric, estoque numeric, score real
)
LANGUAGE sql STABLE AS
$$
  WITH t AS (SELECT f_unaccent(lower(trim(p_termo))) AS termo)
  SELECT p.id, p.nome, p.categoria, p.local, p.unidade, p.preco, p.estoque,
         GREATEST(
           similarity(f_unaccent(lower(p.nome)), t.termo),
           CASE WHEN f_unaccent(lower(p.nome)) ILIKE '%' || t.termo || '%' THEN 0.85 ELSE 0 END,
           CASE WHEN p.codigo = trim(p_termo) THEN 1.0 ELSE 0 END,
           similarity(f_unaccent(lower(coalesce(p.categoria,''))), t.termo) * 0.6
         )::real AS score
  FROM produto p, t
  WHERE p.ativo
    AND (
      f_unaccent(lower(p.nome)) % t.termo
      OR f_unaccent(lower(p.nome)) ILIKE '%' || t.termo || '%'
      OR f_unaccent(lower(coalesce(p.categoria,''))) ILIKE '%' || t.termo || '%'
      OR p.codigo = trim(p_termo)
    )
  ORDER BY score DESC, p.nome
  LIMIT p_limite;
$$;

-- limiar mais tolerante para voz (padrao do Postgres e 0.3, alto demais para transcricao).
-- Persistente no banco; exige reconexao para valer.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET pg_trgm.similarity_threshold = 0.22', current_database());
END $$;

SET pg_trgm.similarity_threshold = 0.22;  -- vale ja nesta sessao
