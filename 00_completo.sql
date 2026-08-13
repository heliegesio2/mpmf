-- ============================================================
-- 00_completo.sql  |  Consulta de preco - mercadinho
-- Recria TUDO do zero: extensoes, tabela, funcao de busca e dados.
-- Pode rodar quantas vezes quiser: apaga o que existe antes.
--
-- COMO RODAR NO DBEAVER:
--   1. Confirme em qual banco voce esta:  SELECT current_database();
--   2. Execute este arquivo inteiro com Alt+X (NAO use Ctrl+Enter).
--   3. Ajuste o DATABASE_URL do .env.local para o mesmo banco.
--
-- ATENCAO: a linha abaixo APAGA a tabela produto e todos os precos
-- que voce ja tiver corrigido. Faca backup antes se for o caso.
-- ============================================================

-- ---------- 1. Limpeza ----------
DROP FUNCTION IF EXISTS buscar_produto(text, int);
DROP TABLE IF EXISTS produto CASCADE;

-- ---------- 2. Extensoes ----------
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent nao e IMMUTABLE por padrao; wrapper para poder indexar
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$f$ SELECT public.unaccent('public.unaccent', $1) $f$;

-- ---------- 3. Tabela ----------
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

-- indice trigram cobrindo exatamente o texto que a funcao pesquisa
CREATE INDEX idx_produto_busca_trgm ON produto USING gin (
  f_unaccent(lower(nome || ' ' || coalesce(categoria, '') || ' ' || coalesce(local, '')))
  gin_trgm_ops
);

CREATE INDEX idx_produto_codigo ON produto (codigo) WHERE codigo IS NOT NULL;

-- ---------- 4. Funcao de busca (LIKE parcial + fuzzy) ----------
CREATE OR REPLACE FUNCTION buscar_produto(p_termo text, p_limite int DEFAULT 8)
RETURNS TABLE (
  id bigint, nome text, categoria text, local text,
  unidade text, preco numeric, estoque numeric, score real
)
LANGUAGE sql STABLE AS
$f$
  WITH t AS (
    SELECT
      f_unaccent(lower(trim(p_termo))) AS termo,
      regexp_split_to_array(
        regexp_replace(f_unaccent(lower(trim(p_termo))), '\s+', ' ', 'g'), ' '
      ) AS palavras
  ),
  base AS (
    SELECT p.*,
           f_unaccent(lower(p.nome || ' ' || coalesce(p.categoria, '')
                            || ' ' || coalesce(p.local, ''))) AS alvo
    FROM produto p
    WHERE p.ativo
  )
  SELECT b.id, b.nome, b.categoria, b.local, b.unidade, b.preco, b.estoque,
         GREATEST(
           CASE WHEN b.codigo = trim(p_termo) THEN 1.00 ELSE 0 END,
           CASE WHEN f_unaccent(lower(b.nome)) LIKE t.termo || '%' THEN 0.95 ELSE 0 END,
           CASE WHEN b.alvo LIKE '%' || t.termo || '%' THEN 0.85 ELSE 0 END,
           CASE WHEN NOT EXISTS (
                  SELECT 1 FROM unnest(t.palavras) w WHERE b.alvo NOT LIKE '%' || w || '%'
                ) THEN 0.70 ELSE 0 END,
           similarity(f_unaccent(lower(b.nome)), t.termo)
         )::real AS score
  FROM base b, t
  WHERE coalesce(array_length(t.palavras, 1), 0) > 0
    AND (
      b.codigo = trim(p_termo)
      OR b.alvo LIKE '%' || t.termo || '%'
      OR NOT EXISTS (
           SELECT 1 FROM unnest(t.palavras) w WHERE b.alvo NOT LIKE '%' || w || '%'
         )
      OR f_unaccent(lower(b.nome)) % t.termo
    )
  ORDER BY score DESC, b.nome
  LIMIT p_limite;
$f$;

-- limiar mais tolerante para transcricao de voz (padrao do Postgres e 0.3)
SET pg_trgm.similarity_threshold = 0.22;
DO $d$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET pg_trgm.similarity_threshold = 0.22', current_database());
END $d$;

-- ---------- 5. Dados (40 mercadorias do inventario) ----------
INSERT INTO produto (nome, categoria, local, unidade, preco, estoque, observacao) VALUES
('Cartela de ovos brancos','Ovos','Balcao vitrine - topo','cartela',18.9,3,'~30 un por cartela (~90 ovos)'),
('Rosquinha / biscoito de polvilho (saco)','Panificacao','Balcao vitrine - topo','pacote',8.5,5,'Sacos transparentes grandes'),
('Pote de vidro com balas/pirulitos','Doces','Balcao vitrine - topo','pote',2.5,4,'Tampa verde'),
('Pao / biscoito em saco vermelho','Panificacao','Balcao vitrine - topo','pacote',8.5,8,'Empilhados'),
('Bolacha recheada (pacote azul)','Biscoitos','Balcao vitrine - topo','pacote',6.9,6,''),
('Caixas expositoras (chocolate/isqueiro/pilha)','Diversos','Balcao vitrine - topo','caixa',5.0,5,'Nao legivel no video'),
('Kerus Presunto','Salgadinho','Balcao vitrine - 1a fila','pacote',4.5,2,''),
('Kerus Requeijao','Salgadinho','Balcao vitrine - 1a fila','pacote',4.5,2,''),
('Kerus Queijo','Salgadinho','Balcao vitrine - 1a fila','pacote',4.5,1,''),
('Kerus Cebola e Salsa','Salgadinho','Balcao vitrine - 1a fila','pacote',4.5,2,''),
('Kerus Pipoca','Salgadinho','Balcao vitrine - 1a fila','pacote',4.5,5,'Embalagem vermelha'),
('Gulao Assado','Salgadinho','Balcao vitrine - 2a fila','pacote',4.5,9,'Variacoes vermelha/verde'),
('Gulao Pururuca','Salgadinho','Balcao vitrine - 2a fila','pacote',4.5,4,'Embalagem preta'),
('Batata Chips MIX Churrasco','Salgadinho','Balcao vitrine - 3a fila','pacote',4.5,7,''),
('Trento (display)','Doces','Balcao vitrine - prateleira','caixa',2.5,3,''),
('Mentos (display)','Doces','Balcao vitrine - prateleira','caixa',2.5,1,''),
('Bacia plastica com salgadinho/batata','Salgados a granel','Balcao vitrine - prateleira','bacia',3.0,6,'1 bacia com batata frita'),
('Pacotes brancos/azul marinho (biscoito/pao)','Biscoitos','Mesa verde 1','pacote',6.9,20,'Marca nao legivel'),
('Rosquinha / biscoito amanteigado','Biscoitos','Mesa verde 1','pacote',6.9,15,''),
('Pacotes vermelhos (biscoito/macarrao)','Biscoitos','Mesa verde 2','pacote',6.9,15,'Marca nao legivel'),
('Pacotes amarelos','Biscoitos','Mesa verde 2','pacote',6.9,6,''),
('Engradado AmBev (vazio/cheio)','Bebidas','Sob a mesa verde','engradado',9.9,3,''),
('Engradado vermelho','Bebidas','Sob a mesa verde','engradado',9.9,1,''),
('Galao/botijao plastico azul','Utilidades','Sob a mesa verde','unidade',15.0,1,''),
('Garrafas refrigerante/cerveja','Bebidas','Geladeira Imbera vertical','garrafa',9.9,15,'Reflexo no vidro - prateleiras altas vazias'),
('Tomate','Frutas','Hortifruti','unidade',7.9,45,'Caixa de madeira'),
('Maca','Frutas','Hortifruti','unidade',7.9,30,''),
('Batata','Legumes','Hortifruti','unidade',5.9,15,''),
('Pimentao / pepino','Legumes','Hortifruti','unidade',5.9,8,''),
('Limao','Frutas','Hortifruti','unidade',7.9,8,''),
('Laranja / tangerina','Frutas','Hortifruti','unidade',7.9,10,''),
('Abacate / fruta escura','Frutas','Hortifruti','unidade',7.9,6,''),
('Papel higienico Beli','Higiene','Hortifruti - prateleira','pacote',22.9,5,'Fardos + avulsos'),
('Bacia plastica verde','Utilidades','Hortifruti - prateleira','unidade',15.0,2,''),
('Saco de rosquinha (parte superior)','Panificacao','Hortifruti - prateleira','pacote',8.5,6,''),
('Garrafas (cachaca/licor/vinho)','Bebidas','Hortifruti - base','garrafa',9.9,10,''),
('Engradado vermelho com garrafas','Bebidas','Hortifruti - base','engradado',9.9,1,''),
('Caixa de bebida (Fumegante?)','Bebidas','Hortifruti - base','caixa',9.9,1,'Rotulo ilegivel'),
('Saco de racao farelada (branco)','Racao','Fundo / estoque','saco',89.9,2,'Escrito FARELADO'),
('Saco de racao para aves (verde)','Racao','Fundo / estoque','saco',89.9,3,'');


-- ---------- 6. Conferencia ----------
SELECT current_database() AS banco_em_uso, COUNT(*) AS total_produtos FROM produto;
SELECT nome, preco, score FROM buscar_produto('gul');
SELECT nome, preco, score FROM buscar_produto('chips batata');
