-- 27_messageria.sql
--
-- Avisos in-app por destinatário (o `usuario` OU o `fornecedor_publico` que está
-- logado) — não é push pra todo mundo. Cada aviso tem título, data/hora e vira
-- "lido". Anotações com data de alerta materializam um aviso por usuário da
-- empresa (lazy, no GET /api/notificacoes), via a coluna `chave` + índice único
-- pra idempotência. O módulo de pedidos (próxima leva) usa os mesmos helpers.
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts). Não vai pro desktop.

CREATE TABLE IF NOT EXISTS notificacao (
  id                    bigserial PRIMARY KEY,
  usuario_id            bigint REFERENCES usuario(id) ON DELETE CASCADE,
  fornecedor_publico_id bigint REFERENCES fornecedor_publico(id) ON DELETE CASCADE,
  tipo                  text NOT NULL DEFAULT 'sistema',
  titulo                text NOT NULL,
  corpo                 text,
  link                  text,
  chave                 text,
  lida                  boolean NOT NULL DEFAULT false,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_notificacao_usuario
  ON notificacao (usuario_id, lida, criado_em DESC) WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notificacao_fornecedor
  ON notificacao (fornecedor_publico_id, lida, criado_em DESC) WHERE fornecedor_publico_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notificacao_chave
  ON notificacao (coalesce(usuario_id, 0), coalesce(fornecedor_publico_id, 0), chave)
  WHERE chave IS NOT NULL;
