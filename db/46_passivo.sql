-- 46_passivo.sql — levantamento de passivos: os bens fixos da empresa que não são
-- mercadoria (banca, cofre, congelador, balcão…). Cadastro manual, por foto ou
-- por vídeo (a IA identifica; ver src/lib/lerPassivoFotos.ts).
-- `foto` é data URL em coluna text (nunca entra em query de lista → `tem_foto`).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

CREATE TABLE IF NOT EXISTS passivo (
  id             bigserial PRIMARY KEY,
  empresa_id     bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  nome           text NOT NULL,
  categoria      text NOT NULL DEFAULT 'outros',
  quantidade     integer NOT NULL DEFAULT 1,
  descricao      text,
  valor_estimado numeric(12,2),
  foto           text,
  origem         text NOT NULL DEFAULT 'manual',   -- manual | foto | video
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_passivo_empresa ON passivo (empresa_id, categoria);
