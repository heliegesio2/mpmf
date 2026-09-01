-- 09_estoque_minimo.sql
-- Aviso de estoque baixo por produto: o comerciante marca "avise quando cair
-- abaixo de N" e escolhe em que unidade pensa esse N (unidade, caixa, fardo...).
--
-- estoque_minimo: o limite (NULL = sem aviso proprio; os relatorios usam um
--   padrao geral nesse caso).
-- estoque_minimo_embalagem: so rotulo, pra montar o texto do alerta
--   ("Areia abaixo de 2 caixa(s)"). A comparacao continua sendo
--   estoque <= estoque_minimo, no numero cru.
-- Idempotente.

ALTER TABLE produto ADD COLUMN IF NOT EXISTS estoque_minimo numeric(12,3);
ALTER TABLE produto ADD COLUMN IF NOT EXISTS estoque_minimo_embalagem text;

COMMENT ON COLUMN produto.estoque_minimo IS
  'Avisar quando estoque <= este valor. NULL = usa o padrao geral dos relatorios.';
COMMENT ON COLUMN produto.estoque_minimo_embalagem IS
  'Unidade em que o comerciante pensa o limite (rotulo do alerta): unidade, caixa, fardo...';
