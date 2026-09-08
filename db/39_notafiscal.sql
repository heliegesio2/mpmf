-- db/39 — NFC-e via Focus NFe. Cada loja vira uma "empresa" própria dentro do
-- Focus NFe (cadastro + certificado digital dela) e ganha um token só dela —
-- nunca um token compartilhado da plataforma emitindo em nome de outra loja.
-- O certificado (.pfx + senha) passa pelo servidor uma única vez, na hora de
-- cadastrar; só o token que volta é guardado (nunca o certificado/senha).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

-- dados fiscais que faltavam pra emitir nota (endereço já existe em empresa:
-- endereco = logradouro, cidade = municipio, bairro, cep)
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS inscricao_estadual text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS regime_tributario smallint;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS numero text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS uf text;

CREATE TABLE IF NOT EXISTS empresa_focusnfe (
  empresa_id          bigint PRIMARY KEY REFERENCES empresa(id) ON DELETE CASCADE,
  focusnfe_empresa_id integer NOT NULL,
  token_producao       text,
  token_homologacao    text NOT NULL,
  ambiente             text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
  conectado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);

-- classificação fiscal por produto — sem isso não dá pra emitir a nota desse item
ALTER TABLE produto ADD COLUMN IF NOT EXISTS ncm text;
ALTER TABLE produto ADD COLUMN IF NOT EXISTS cfop text;
ALTER TABLE produto ADD COLUMN IF NOT EXISTS icms_origem text NOT NULL DEFAULT '0';
ALTER TABLE produto ADD COLUMN IF NOT EXISTS icms_situacao_tributaria text;

-- acompanha a nota emitida (ou tentada) pra cada venda
CREATE TABLE IF NOT EXISTS venda_nota (
  id             bigserial PRIMARY KEY,
  venda_id       bigint NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
  ref            text NOT NULL UNIQUE,
  status         text NOT NULL DEFAULT 'processando',
  chave_nfe      text,
  numero         text,
  serie          text,
  caminho_danfe  text,
  caminho_xml    text,
  mensagem_sefaz text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_venda_nota_venda ON venda_nota (venda_id);
