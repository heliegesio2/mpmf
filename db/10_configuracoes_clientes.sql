-- 10_configuracoes_clientes.sql
-- Configuracoes da empresa (dados + chave Pix), cadastro de cliente e fiado
-- (contas a receber). Tudo idempotente. Espelhado em MIGRACOES_IDEMPOTENTES
-- no src/lib/db.ts (roda sozinho na conexao) porque a migracao manual em
-- producao ja errou de branch da Neon varias vezes.

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS endereco  text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cep       text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS horario   text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS pix_chave text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS pix_nome  text;

COMMENT ON COLUMN empresa.horario   IS 'Horario de funcionamento, texto livre';
COMMENT ON COLUMN empresa.pix_chave IS 'Chave Pix usada pra gerar o QR na venda';
COMMENT ON COLUMN empresa.pix_nome  IS 'Nome do recebedor no BR Code (cai pro nome da empresa se vazio)';

CREATE TABLE IF NOT EXISTS cliente (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  cpf        text,
  telefone   text,
  whatsapp   boolean NOT NULL DEFAULT false,
  endereco   text NOT NULL,
  cep        text,
  foto       text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cliente_empresa ON cliente (empresa_id, nome);

CREATE TABLE IF NOT EXISTS fiado (
  id         bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  cliente_id bigint NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  valor      numeric(10,2) NOT NULL CHECK (valor > 0),
  descricao  text,
  pago       boolean NOT NULL DEFAULT false,
  pago_em    timestamptz,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fiado_empresa ON fiado (empresa_id, pago, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_fiado_cliente ON fiado (cliente_id) WHERE pago = false;
