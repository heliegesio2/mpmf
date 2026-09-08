-- db/38 — Pix automático via Mercado Pago Connect: cada loja conecta sua
-- PRÓPRIA conta Mercado Pago (OAuth), então o dinheiro do Pix continua caindo
-- direto na conta de cada lojista (nunca numa conta central da plataforma).
-- Um app_mercadopago só existe uma vez por empresa (reconectar substitui).
-- `ativo` deixa a loja conectada mas escolher usar o Pix direto (chave, sem
-- taxa, confirmação manual) em vez do Mercado Pago (confirma sozinho, com taxa).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

CREATE TABLE IF NOT EXISTS empresa_mercadopago (
  empresa_id     bigint PRIMARY KEY REFERENCES empresa(id) ON DELETE CASCADE,
  mp_user_id     text NOT NULL,
  access_token   text NOT NULL,
  refresh_token  text NOT NULL,
  expira_em      timestamptz NOT NULL,
  ativo          boolean NOT NULL DEFAULT true,
  conectado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
