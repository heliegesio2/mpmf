-- referencia_schema_completo.sql
-- Snapshot (pg_dump --schema-only) do banco local em 2026-08-14, NAO um
-- arquivo de migracao sequencial.
--
-- Os arquivos 01..07 ficaram desatualizados: faltam as tabelas empresa e
-- usuario, e faltam colunas em produto (empresa_id, tipo_venda,
-- preco_compra) que foram criadas direto no banco (fora dos arquivos de
-- migracao) em algum momento do desenvolvimento. Este arquivo captura o
-- schema real e completo que estava rodando localmente e que ja foi
-- aplicado em producao (Neon).
--
-- NAO rode isto depois de 01..07 — as tabelas ja existiriam e o CREATE
-- TABLE falharia. Use como referencia para conferir o schema real, ou
-- para popular um banco novo do zero (nesse caso, e o unico arquivo
-- necessario; nao precisa rodar 01..07 antes).
--
-- Qualquer alteracao de schema daqui pra frente deve virar um novo arquivo
-- numerado (08_..., 09_...) — nao edite este arquivo.

--
-- PostgreSQL database dump
--

\restrict XO8lbqQO0VK5t0nROMGjn8jpWXeJ5ugASz5AeWbVXen6JhH8PUmWsKatP5GvamR

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: buscar_produto(bigint, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buscar_produto(p_empresa bigint, p_termo text, p_limite integer DEFAULT 8) RETURNS TABLE(id bigint, nome text, categoria text, local text, unidade text, tipo_venda text, preco numeric, preco_compra numeric, estoque numeric, score real)
    LANGUAGE sql STABLE
    AS $$
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
    WHERE p.ativo AND p.empresa_id = p_empresa
  )
  SELECT b.id, b.nome, b.categoria, b.local, b.unidade, b.tipo_venda,
         b.preco, b.preco_compra, b.estoque,
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
$$;


--
-- Name: f_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.f_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $_$ SELECT public.unaccent('public.unaccent', $1) $_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: caixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caixa (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    valor numeric(10,2) NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caixa_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- Name: caixa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.caixa_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: caixa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.caixa_id_seq OWNED BY public.caixa.id;


--
-- Name: casco; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.casco (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    responsavel text NOT NULL,
    telefone text NOT NULL,
    endereco text NOT NULL,
    quantidade integer NOT NULL,
    devolvido boolean DEFAULT false NOT NULL,
    devolvido_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT casco_quantidade_check CHECK ((quantidade > 0))
);


--
-- Name: casco_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.casco_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: casco_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.casco_id_seq OWNED BY public.casco.id;


--
-- Name: custo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custo (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    descricao text CONSTRAINT custo_servico_not_null NOT NULL,
    valor numeric(10,2) NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    beneficiario text NOT NULL,
    CONSTRAINT custo_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: custo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custo_id_seq OWNED BY public.custo.id;


--
-- Name: empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresa (
    id bigint NOT NULL,
    nome text NOT NULL,
    documento text,
    telefone text,
    cidade text,
    situacao text DEFAULT 'pendente'::text NOT NULL,
    motivo text,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    decidida_em timestamp with time zone,
    CONSTRAINT empresa_situacao_check CHECK ((situacao = ANY (ARRAY['pendente'::text, 'aprovada'::text, 'reprovada'::text])))
);


--
-- Name: empresa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.empresa_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.empresa_id_seq OWNED BY public.empresa.id;


--
-- Name: produto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produto (
    id bigint NOT NULL,
    codigo text,
    nome text NOT NULL,
    categoria text,
    local text,
    unidade text DEFAULT 'unidade'::text NOT NULL,
    preco numeric(10,2) DEFAULT 0 NOT NULL,
    estoque numeric(12,3) DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    observacao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    alterado_em timestamp with time zone DEFAULT now() NOT NULL,
    preco_compra numeric(10,2) DEFAULT 0 NOT NULL,
    tipo_venda text DEFAULT 'unidade'::text NOT NULL,
    empresa_id bigint NOT NULL,
    CONSTRAINT produto_tipo_venda_check CHECK ((tipo_venda = ANY (ARRAY['unidade'::text, 'quilo'::text, 'duzia'::text])))
);


--
-- Name: COLUMN produto.unidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produto.unidade IS 'Embalagem, so descritivo: pacote, saco, cartela';


--
-- Name: COLUMN produto.preco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produto.preco IS 'Preco de venda ao cliente';


--
-- Name: COLUMN produto.preco_compra; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produto.preco_compra IS 'Quanto custou no fornecedor';


--
-- Name: COLUMN produto.tipo_venda; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.produto.tipo_venda IS 'Como o preco e cobrado: por unidade, por quilo ou por duzia';


--
-- Name: produto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.produto_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: produto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.produto_id_seq OWNED BY public.produto.id;


--
-- Name: usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario (
    id bigint NOT NULL,
    empresa_id bigint,
    nome text NOT NULL,
    email text NOT NULL,
    senha_hash text NOT NULL,
    papel text DEFAULT 'operador'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usuario_empresa_check CHECK (((papel = 'super_admin'::text) OR (empresa_id IS NOT NULL))),
    CONSTRAINT usuario_papel_check CHECK ((papel = ANY (ARRAY['super_admin'::text, 'admin'::text, 'operador'::text])))
);


--
-- Name: usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuario_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuario_id_seq OWNED BY public.usuario.id;


--
-- Name: vw_margem; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_margem AS
 SELECT id,
    nome,
    categoria,
    tipo_venda,
    preco_compra,
    preco,
    (preco - preco_compra) AS lucro,
        CASE
            WHEN (preco_compra > (0)::numeric) THEN round((((preco - preco_compra) / preco_compra) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS margem_percentual
   FROM public.produto
  WHERE ativo
  ORDER BY
        CASE
            WHEN (preco_compra > (0)::numeric) THEN round((((preco - preco_compra) / preco_compra) * (100)::numeric), 1)
            ELSE NULL::numeric
        END;


--
-- Name: caixa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixa ALTER COLUMN id SET DEFAULT nextval('public.caixa_id_seq'::regclass);


--
-- Name: casco id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casco ALTER COLUMN id SET DEFAULT nextval('public.casco_id_seq'::regclass);


--
-- Name: custo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custo ALTER COLUMN id SET DEFAULT nextval('public.custo_id_seq'::regclass);


--
-- Name: empresa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa ALTER COLUMN id SET DEFAULT nextval('public.empresa_id_seq'::regclass);


--
-- Name: produto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto ALTER COLUMN id SET DEFAULT nextval('public.produto_id_seq'::regclass);


--
-- Name: usuario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario ALTER COLUMN id SET DEFAULT nextval('public.usuario_id_seq'::regclass);


--
-- Name: caixa caixa_empresa_id_data_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixa
    ADD CONSTRAINT caixa_empresa_id_data_key UNIQUE (empresa_id, data);


--
-- Name: caixa caixa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixa
    ADD CONSTRAINT caixa_pkey PRIMARY KEY (id);


--
-- Name: casco casco_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casco
    ADD CONSTRAINT casco_pkey PRIMARY KEY (id);


--
-- Name: custo custo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custo
    ADD CONSTRAINT custo_pkey PRIMARY KEY (id);


--
-- Name: empresa empresa_documento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_documento_key UNIQUE (documento);


--
-- Name: empresa empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresa
    ADD CONSTRAINT empresa_pkey PRIMARY KEY (id);


--
-- Name: produto produto_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT produto_codigo_key UNIQUE (codigo);


--
-- Name: produto produto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT produto_pkey PRIMARY KEY (id);


--
-- Name: usuario usuario_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_email_key UNIQUE (email);


--
-- Name: usuario usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id);


--
-- Name: idx_caixa_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caixa_empresa ON public.caixa USING btree (empresa_id, data DESC);


--
-- Name: idx_casco_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casco_empresa ON public.casco USING btree (empresa_id, criado_em DESC);


--
-- Name: idx_custo_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custo_empresa ON public.custo USING btree (empresa_id, criado_em DESC);


--
-- Name: idx_produto_busca_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produto_busca_trgm ON public.produto USING gin (public.f_unaccent(lower(((((nome || ' '::text) || COALESCE(categoria, ''::text)) || ' '::text) || COALESCE(local, ''::text)))) public.gin_trgm_ops);


--
-- Name: idx_produto_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_produto_codigo ON public.produto USING btree (empresa_id, codigo) WHERE (codigo IS NOT NULL);


--
-- Name: idx_produto_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produto_empresa ON public.produto USING btree (empresa_id);


--
-- Name: idx_usuario_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuario_email ON public.usuario USING btree (lower(email));


--
-- Name: caixa caixa_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixa
    ADD CONSTRAINT caixa_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: casco casco_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casco
    ADD CONSTRAINT casco_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: custo custo_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custo
    ADD CONSTRAINT custo_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: produto produto_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT produto_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- Name: usuario usuario_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresa(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict XO8lbqQO0VK5t0nROMGjn8jpWXeJ5ugASz5AeWbVXen6JhH8PUmWsKatP5GvamR

