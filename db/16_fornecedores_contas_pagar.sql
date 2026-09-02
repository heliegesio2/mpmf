-- 16_fornecedores_contas_pagar.sql
-- Cadastro de fornecedores + contas a pagar (boletos/notas). Idempotente;
-- espelhado em MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

CREATE TABLE IF NOT EXISTS fornecedor (
  id                bigserial PRIMARY KEY,
  empresa_id        bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  nome              text NOT NULL,
  documento         text,
  telefone          text,
  telefone_whatsapp boolean NOT NULL DEFAULT false,
  endereco          text,
  observacao        text,
  criado_em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fornecedor_empresa ON fornecedor (empresa_id, nome);

CREATE TABLE IF NOT EXISTS conta_pagar (
  id            bigserial PRIMARY KEY,
  empresa_id    bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  fornecedor_id bigint REFERENCES fornecedor(id) ON DELETE SET NULL,
  descricao     text,
  valor         numeric(12,2) NOT NULL CHECK (valor > 0),
  vencimento    date,
  foto          text,
  pago          boolean NOT NULL DEFAULT false,
  pago_em       timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conta_pagar_empresa ON conta_pagar (empresa_id, pago, vencimento);
