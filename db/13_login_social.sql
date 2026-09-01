-- 13_login_social.sql
-- Login com Google/Facebook (OAuth na mao). Usuario que entra por rede social
-- nao tem senha, e uma conta pode ter mais de uma identidade vinculada.
-- Idempotente; espelhado em MIGRACOES_IDEMPOTENTES no src/lib/db.ts.

ALTER TABLE usuario ALTER COLUMN senha_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS usuario_identidade (
  id          bigserial PRIMARY KEY,
  usuario_id  bigint NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  provedor    text NOT NULL,          -- 'google' | 'facebook'
  provedor_id text NOT NULL,          -- 'sub' do Google, 'id' do Facebook
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provedor, provedor_id)
);
CREATE INDEX IF NOT EXISTS idx_identidade_usuario ON usuario_identidade (usuario_id);
